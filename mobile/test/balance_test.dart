import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart' hide find;
import 'package:k8sthegame/engine/game.dart';

const order = [
  'u-wl1',
  'u-ob1',
  'u-if1',
  'u-ci1',
  'u-wl2',
  'u-ob2',
  'u-if3',
  'u-if2',
  'u-sc1',
  'u-ci2',
  'u-if4',
  'u-sc2',
];
void deploy(Game g, String name, int replicas) {
  final repo = g.repos.firstWhere((r) => r['name'] == name);
  final image = find(g.latestImages, (i) => i['repoId'] == repo['id']);
  if (image == null) {
    g.dispatch('BUILD_IMAGE', {'repoId': repo['id']});
    return;
  }
  final existing = g.service(name);
  g.dispatch(
    existing == null ? 'FORM_NEW' : 'FORM_EDIT',
    existing == null ? {'imageId': image['id']} : {'id': existing['id']},
  );
  g.dispatch('FORM_SET', {
    'patch': {
      'imageId': image['id'],
      'replicas': replicas,
      if (g.owns('deployments')) 'type': 'Deployment',
      if (g.owns('dashboard')) ...{'liveness': true, 'readiness': true},
    },
  });
  g.dispatch('SERVICE_SAVE');
  g.dispatch('FORM_CLOSE');
}

void policy(Game g) {
  for (final t in g.tickets.where((t) => t['status'] == 'todo').toList()) {
    if (g.met(t)) {
      g.dispatch('TICKET_RESOLVE', {'id': t['id']});
      continue;
    }
    final s = g.service(t['svc']);
    var want = math.max(2, (s?['replicas'] ?? 0) as int);
    final criteria = records(t['criteria']);
    for (final c in criteria) {
      if (c['kind'] == 'replicas') want = math.max(want, (c['n'] ?? 1) as int);
      if (c['kind'] == 'node_tag') {
        for (final n in g.nodes) {
          g.dispatch('NODE_ADD_TAG', {'id': n['id'], 'tag': c['tag']});
        }
      }
    }
    if (s == null ||
        s['replicas'] < want ||
        (criteria.any((c) => c['kind'] == 'ha') &&
            s['type'] != 'Deployment' &&
            g.owns('deployments')) ||
        (criteria.any((c) => c['kind'] == 'latest') && !g.latest(s)) ||
        (criteria.any((c) => c['kind'] == 'probes') &&
            !(s['liveness'] && s['readiness']))) {
      if (g.totalFree(s?['id']) >= want) deploy(g, t['svc'], want);
    }
    if (s?['status'] == 'CrashLoopBackOff') {
      g.dispatch('SERVICE_RESTART', {'id': s!['id']});
    }
  }
  if (g.totalFree() < 3 && g.budget > 1600) {
    g.dispatch('PROVISION_NODE', {
      'kind': 'generic',
      'tier': g.owns('large_nodes') ? 'Large' : 'Normal',
    });
  }
  for (final id in order) {
    final u = g.upgrades.firstWhere((u) => u['id'] == id);
    if (g.affordable(u) && g.budget - u['cost'] > 900) {
      g.dispatch('BUY_UPGRADE', {'id': id});
    }
  }
  for (final s in g.services) {
    if (s['status'] == 'CrashLoopBackOff') {
      g.dispatch('SERVICE_RESTART', {'id': s['id']});
    }
  }
  if (g.budget < 0) g.dispatch('BAILOUT');
  g.advance();
  g.buildTick();
}

void main() {
  test('reasonable policy can finish the campaign without a death spiral', () {
    var wins = 0;
    for (final seed in [11, 2024, 777]) {
      final g = Game(seed: seed);
      num minimum = g.budget;
      for (var i = 0; i < 1200; i++) {
        policy(g);
        minimum = math.min(minimum, g.budget);
        if (g.ended) {
          if (g.state['outcome']['kind'] == 'won') {
            wins++;
            expect(g.tick, greaterThan(384));
            g.dispatch('CONTINUE_ENDLESS');
          } else {
            break;
          }
        }
        if (i == 599) {
          expect(g.state['stats']['ticketsResolved'], greaterThanOrEqualTo(6));
        }
      }
      expect(g.state['outcome']?['kind'], isNot('lost'), reason: 'seed $seed');
      expect(minimum, greaterThan(-1500), reason: 'seed $seed');
      expect(
        g.tickets.any(
          (t) =>
              t['type'] != 'bug' &&
              int.parse((t['id'] as String).split('-').last) >= 105,
        ),
        true,
      );
    }
    expect(wins, greaterThanOrEqualTo(2));
  });
}
