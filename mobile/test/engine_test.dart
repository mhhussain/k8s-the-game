import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:k8sthegame/engine/game.dart';
import 'package:k8sthegame/engine/save.dart';

void main() {
  Game deployed() {
    final g = Game(seed: 42);
    g.dispatch('BUILD_IMAGE', {'repoId': 'repo-1'});
    for (var i = 0; i < 5; i++) {
      g.buildTick();
    }
    g.dispatch('FORM_NEW');
    g.dispatch('SERVICE_SAVE');
    for (var i = 0; i < 3; i++) {
      g.advance();
    }
    return g;
  }

  test(
    'first-ticket playthrough agrees with web economic and service state',
    () {
      final cases = jsonDecode(
        File('test/fixtures/web-playthrough.json').readAsStringSync(),
      ) as List;
      final g = Game(seed: 42);
      for (final c in cases) {
        final a = Map<String, dynamic>.from(c['action']);
        final type = a.remove('type') as String;
        g.dispatch(type, a);
        final expected = c['state'];
        for (final key in [
          'meters',
          'nodes',
          'images',
          'services',
          'rng',
          'seq',
          'budgetDebtTicks',
        ]) {
          expect(g.state[key], expected[key], reason: '$type / $key');
        }
      }
    },
  );
  test('current web save imports and round trips', () {
    final text = File('test/fixtures/web-save.json').readAsStringSync();
    final g = Game.fromState(SaveCodec.decode(text));
    expect(g.tickets.first['paid'], true);
    expect(g.paused, true);
    final again = SaveCodec.decode(g.exportSave());
    expect(again['services'], g.state['services']);
    expect(again['meters'], g.state['meters']);
  });
  test(
    'reject corrupt, unsupported and inconsistent saves transactionally',
    () {
      final g = deployed();
      final original = g.exportSave();
      for (final change in <void Function(Record)>[
        (f) => f['version'] = 999,
        (f) => f['state']['services'][0]['replicas'] = 100,
        (f) => f['state']['services'][0]['imageId'] = 'missing',
        (f) => f['state']['nodes'][0]['tags'] = ['BAD'],
        (f) => f['state']['clock']['speed'] = 0,
        (f) => f['state']['tickets'][0]['criteria'] = [
          {'kind': 'evil'},
        ],
      ]) {
        final f = jsonDecode(original) as Record;
        change(f);
        expect(() => SaveCodec.decode(jsonEncode(f)), throwsFormatException);
      }
      expect(g.services.single['replicas'], 2);
    },
  );
  test('reopening a ticket cannot pay twice', () {
    final g = deployed();
    g.dispatch('TICKET_RESOLVE', {'id': 'TCK-101'});
    final budget = g.budget, xp = g.xp;
    g.dispatch('TICKET_REOPEN', {'id': 'TCK-101'});
    g.dispatch('TICKET_RESOLVE', {'id': 'TCK-101'});
    expect(g.budget, budget);
    expect(g.xp, xp);
  });
  test('standing criteria produce unpaid regression and recover', () {
    final g = deployed();
    g.dispatch('TICKET_RESOLVE', {'id': 'TCK-101'});
    g.dispatch('SERVICE_DELETE', {'id': g.services.first['id']});
    for (var i = 0; i < 8; i++) {
      g.advance();
    }
    final bug = g.tickets.where((t) => t['type'] == 'bug').single;
    expect(bug['reward'], 0);
    expect(bug['xp'], 0);
    expect(g.paused, true);
  });
  test('manual placement rejects overcapacity without changing service', () {
    final g = deployed();
    g.dispatch('PROVISION_NODE', {'kind': 'generic'});
    g.dispatch('FORM_EDIT', {'id': g.services.first['id']});
    g.dispatch('FORM_SET', {
      'patch': {'replicas': 5, 'spread': 'manual'},
    });
    g.state['form']['draft']['podNodes'] = List.filled(5, g.nodes.first['id']);
    g.dispatch('SERVICE_SAVE');
    expect(g.services.first['replicas'], 2);
    expect(g.state['form']['open'], true);
  });
  test('deployment recovers from outage; bare pod does not rehome', () {
    final g = deployed();
    g.dispatch('PROVISION_NODE', {'kind': 'generic'});
    g.upgrades.firstWhere((u) => u['effect'] == 'deployments')['owned'] = true;
    g.dispatch('FORM_EDIT', {'id': g.services.first['id']});
    g.dispatch('FORM_SET', {
      'patch': {'type': 'Deployment'},
    });
    g.dispatch('SERVICE_SAVE');
    g.nodes.first['downFor'] = 8;
    g.advance();
    expect(
      g.pods(g.services.first).every((id) => id == g.nodes.last['id']),
      true,
    );
  });
  test('bankruptcy, endless continuation and funding limits', () {
    final g = Game(seed: 2);
    g.state['meters']['budget'] = -10000;
    for (var i = 0; i < 96; i++) {
      g.advance();
    }
    expect(g.state['outcome']['kind'], 'lost');
    final tick = g.tick;
    g.advance();
    expect(g.tick, tick);
    g.dispatch('CONTINUE_ENDLESS');
    g.advance();
    expect(g.tick, tick + 1);
    g.dispatch('BAILOUT');
    final b = g.budget;
    g.dispatch('BAILOUT');
    expect(g.budget, b);
  });
  test('latest criterion stays pinned when newer builds finish', () {
    final g = deployed();
    final s = g.services.first;
    final criterion = g.latestCriterion(s);
    g.dispatch('BUILD_IMAGE', {'repoId': 'repo-1'});
    for (var i = 0; i < 5; i++) {
      g.buildTick();
    }
    expect(g.grade(criterion), true);
  });
  test('deadline reward floors at half', () {
    final g = Game();
    final ticket = {'reward': 1000, 'dueTick': 0};
    g.state['clock']['tick'] = 10000;
    expect(g.reward(ticket), 500);
  });
  test('seeded simulation stays deterministic through events and requests', () {
    final a = deployed(), b = deployed();
    for (var i = 0; i < 500; i++) {
      a.advance();
      b.advance();
      a.buildTick();
      b.buildTick();
    }
    expect(a.state, b.state);
    expect(a.tickets.length, greaterThan(4));
  });
  test('all upgrades remain purchasable in dependency order and win', () {
    final g = Game();
    g.state['meters']['budget'] = 100000;
    g.state['meters']['xp'] = 10000;
    for (var pass = 0; pass < 5; pass++) {
      for (final u in g.upgrades) {
        g.dispatch('BUY_UPGRADE', {'id': u['id']});
      }
    }
    expect(g.upgrades.every((u) => u['owned'] == true), true);
    expect(g.state['outcome']['kind'], 'won');
  });
}
