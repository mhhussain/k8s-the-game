// Offline simulation. JSON-shaped records deliberately retain the web save schema.
import 'dart:convert';
import 'dart:math' as math;

import 'catalog.dart';
part 'simulation.dart';
part 'requests.dart';

typedef Record = Map<String, dynamic>;
Record copy(Record value) => jsonDecode(jsonEncode(value)) as Record;
List<Record> records(dynamic value) => (value as List).cast<Record>();
Record? find(Iterable<Record> values, bool Function(Record) test) {
  for (final value in values) {
    if (test(value)) return value;
  }
  return null;
}

num clamp(num n, num low, num high) => n.clamp(low, high);

class RandomStream {
  int seed;
  RandomStream(this.seed);
  double next() {
    seed = (seed + 0x6D2B79F5) & 0xffffffff;
    var t = ((seed ^ (seed >> 15)) * (seed | 1)) & 0xffffffff;
    t = (t ^ (t + (((t ^ (t >> 7)) * (t | 61)) & 0xffffffff))) & 0xffffffff;
    return ((t ^ (t >> 14)) & 0xffffffff) / 4294967296;
  }

  double range(num a, num b) => a + next() * (b - a);
  int integer(int a, int b) => a + (next() * (b - a + 1)).floor();
  bool chance(num p) => next() < p;
  T pick<T>(List<T> items) => items[(next() * items.length).floor()];
}

class Game {
  Record state;
  Game({int? seed}) : state = freshState() {
    state['rng'] = (seed ?? DateTime.now().millisecondsSinceEpoch) & 0xffffffff;
  }
  Game.fromState(this.state);
  List<Record> get nodes => records(state['nodes']);
  List<Record> get services => records(state['services']);
  List<Record> get images => records(state['images']);
  List<Record> get tickets => records(state['tickets']);
  List<Record> get upgrades => records(state['upgrades']);
  List<Record> get repos => records(state['repos']);
  int get tick => state['clock']['tick'];
  int get day => tick ~/ 48 + 1;
  bool get paused => state['clock']['paused'];
  bool get ended => state['outcome'] != null && state['endless'] != true;
  num get budget => state['meters']['budget'];
  num get xp => state['meters']['xp'];
  bool owns(String effect) =>
      upgrades.any((u) => u['effect'] == effect && u['owned'] == true);
  Record? service(String name) => find(services, (s) => s['name'] == name);
  Record? image(String id) => find(images, (i) => i['id'] == id);
  int version(Record s) => image(s['imageId'])?['version'] ?? 0;
  int latestVersion(Record s) {
    final repo = image(s['imageId'])?['repoId'];
    return images
        .where((i) => i['repoId'] == repo && i['building'] != true)
        .fold(0, (v, i) => math.max(v, i['version'] as int));
  }

  bool latest(Record s) =>
      image(s['imageId']) != null && version(s) >= latestVersion(s);
  List<Record> get latestImages {
    final byRepo = <String, Record>{};
    for (final i in images.where((i) => i['building'] != true)) {
      if ((byRepo[i['repoId']]?['version'] ?? 0) < i['version']) {
        byRepo[i['repoId']] = i;
      }
    }
    return byRepo.values.toList();
  }

  List<String> pods(Record s) =>
      (s['podNodes'] as List).take(s['replicas']).cast<String>().toList();
  int used(String id, [String? except]) => services
      .where((s) => s['id'] != except)
      .fold(0, (n, s) => n + pods(s).where((p) => p == id).length);
  Map<String, int> free([String? except]) => {
    for (final n in nodes)
      n['id'] as String: (n['slots'] as int) - used(n['id'], except),
  };
  int totalFree([String? except]) =>
      free(except).values.fold(0, (a, b) => a + b);
  int misplaced(Record s) => s['affinity'] == null
      ? 0
      : pods(s)
            .where(
              (id) =>
                  !(find(nodes, (n) => n['id'] == id)?['tags'] as List? ?? [])
                      .contains(s['affinity']),
            )
            .length;
  int offline(Record s) => pods(s)
      .where((id) => (find(nodes, (n) => n['id'] == id)?['downFor'] ?? 1) > 0)
      .length;
  List<String> spread(int count, {String? affinity, String? except}) {
    final cap = free(except);
    var pool = nodes.where((n) => n['downFor'] <= 0).toList();
    if (pool.isEmpty) pool = [...nodes];
    pool.sort((a, b) {
      final am = affinity == null || (a['tags'] as List).contains(affinity)
          ? 0
          : 1;
      final bm = affinity == null || (b['tags'] as List).contains(affinity)
          ? 0
          : 1;
      if (am != bm) return am - bm;
      final diff = cap[b['id']]! - cap[a['id']]!;
      return diff != 0 ? diff : (a['name'] as String).compareTo(b['name']);
    });
    final out = <String>[];
    while (out.length < count) {
      final before = out.length;
      for (final n in pool) {
        if (out.length >= count) break;
        if (cap[n['id']]! > 0) {
          out.add(n['id']);
          cap[n['id']] = cap[n['id']]! - 1;
        }
      }
      if (out.length == before) break;
    }
    while (out.length < count) {
      out.add(pool.isEmpty ? '' : pool.first['id']);
    }
    return out;
  }

  num demand(Record s) {
    num mult = config['HOUR_CURVE'][(state['clock']['mins'] as int) ~/ 60 % 24];
    for (final e in records(state['events'])) {
      if (tick >= e['startTick'] &&
          tick < e['endTick'] &&
          (e['kind'] == 'traffic_dip' ||
              (e['kind'] == 'sale' && e['svc'] == s['name']))) {
        mult *= e['mult'] ?? 1;
      }
    }
    return s['demand'] * mult;
  }

  num get upkeep =>
      services.fold<num>(0, (a, s) => a + s['replicas'] * 60) +
      nodes.fold<num>(0, (a, n) => a + config['NODE_COST'][n['tier']]);
  num get revenue => services
      .where(
        (s) => !['Pending', 'CrashLoopBackOff', 'Idle'].contains(s['status']),
      )
      .fold<num>(
        0,
        (a, s) =>
            a +
            math.min(demand(s), s['ready'][0] * 55) *
                (1 - s['errorRate']) *
                3.2,
      );
  bool grade(Record c) {
    final s = service(c['svc']);
    if (s == null) return false;
    return switch (c['kind']) {
      'running' =>
        s['replicas'] > 0 &&
            !['Pending', 'CrashLoopBackOff', 'Idle'].contains(s['status']) &&
            s['ready'][0] > 0,
      'replicas' => s['replicas'] >= (c['n'] ?? 1),
      'deployment' => s['type'] == 'Deployment',
      'ha' =>
        s['type'] == 'Deployment' &&
            s['replicas'] >= 2 &&
            pods(s).toSet().length >= 2,
      'spread' => pods(s).toSet().length >= (c['n'] ?? 2),
      'node_tag' =>
        pods(s).isNotEmpty &&
            pods(s).every(
              (id) =>
                  (find(nodes, (n) => n['id'] == id)?['tags'] as List? ?? [])
                      .contains(c['tag']),
            ),
      'latest' =>
        (c['n'] != null ? version(s) >= c['n'] : latest(s)) &&
            s['status'] != 'Stale',
      'probes' => s['liveness'] && s['readiness'],
      'stable' =>
        s['status'] == 'Running' &&
            s['errorRate'] < 0.06 &&
            s['ready'][0] == s['ready'][1] &&
            s['replicas'] > 0 &&
            misplaced(s) == 0,
      _ => false,
    };
  }

  bool met(Record t) => records(t['criteria']).every(grade);
  int reward(Record t) =>
      (t['reward'] *
              (t['dueTick'] == null || tick <= t['dueTick']
                  ? 1
                  : math.max(0.5, 1 - (tick - t['dueTick']) / 48 * 0.25)))
          .round();
  bool affordable(Record u) =>
      u['owned'] != true &&
      (u['requires'] as List).every(
        (id) => find(upgrades, (x) => x['id'] == id)?['owned'] == true,
      ) &&
      budget >= u['cost'] &&
      xp >= u['xp'];
  String id(String prefix) {
    state['seq']['uid']++;
    return '$prefix-${(state['seq']['uid'] as int).toRadixString(36)}';
  }

  void say(String kind, String title, String msg) {
    final log = records(state['log']);
    final entry = <String, dynamic>{
      'id': log.isEmpty ? 1 : log.last['id'] + 1,
      'tick': tick,
      'kind': kind,
      'title': title,
      'msg': msg,
    };
    state['log'] = [
      ...log,
      entry,
    ].skip(math.max(0, log.length + 1 - 80)).toList();
    state['toasts'] = [
      ...records(state['toasts']),
      {...entry, 'id': 't-$tick-${entry['id']}', 'at': tick},
    ].reversed.take(5).toList().reversed.toList();
  }

  Record draft([String? imageId]) {
    final i =
        find(latestImages, (i) => i['id'] == imageId) ??
        (latestImages.isEmpty ? null : latestImages.first);
    return {
      'name': i == null
          ? ''
          : find(repos, (r) => r['id'] == i['repoId'])!['name'],
      'imageId': i?['id'] ?? '',
      'type': 'Pod',
      'replicas': 2,
      'liveness': false,
      'readiness': false,
      'affinity': null,
      'spread': 'auto',
      'podNodes': spread(2),
    };
  }

  void dispatch(String action, [Record a = const {}]) {
    switch (action) {
      case 'PAUSE':
        state['clock']['paused'] = a['paused'];
      case 'SPEED':
        if (!ended) {
          state['clock']['speed'] = a['speed'];
          state['clock']['paused'] = false;
        }
      case 'SET_DRAMA':
        state['settings']['drama'] = clamp(a['drama'], 0, 1);
      case 'SET_PAUSE_ON_TICKET':
        state['settings']['pauseOnTicket'] = a['on'];
      case 'CLEAR_BEAT':
        state['firstBeat'] = null;
      case 'NAV':
        state['ui']['screen'] = a['screen'];
      case 'INFRA_TAB':
        state['ui']['infraTab'] = a['tab'];
      case 'BOARD_VIEW':
        state['ui']['boardView'] = a['view'];
      case 'OPEN_TICKET':
        state['ui']['openTicket'] = a['id'];
      case 'CONTINUE_ENDLESS':
        state['endless'] = true;
        state['clock']['paused'] = true;
      case 'NEW_GAME':
        state = Game(seed: a['seed']).state;
      case 'PROVISION_NODE':
        final tier = a['kind'] == 'special' ? 'Special' : a['tier'] ?? 'Normal';
        if ((tier == 'Large' && !owns('large_nodes')) ||
            (tier == 'Special' && !owns('special_nodes'))) {
          return;
        }
        final cost = config['NODE_PROVISION'][tier] as num;
        if (budget < cost) {
          say('warn', 'Not enough budget', 'Provisioning needs \$$cost.');
          return;
        }
        final names = (config['NODE_NAMES'] as List)
            .map((n) => 'node-$n')
            .where((n) => !nodes.any((x) => x['name'] == n));
        final name = names.isEmpty ? 'node-n${nodes.length + 1}' : names.first;
        (state['nodes'] as List).add({
          'id': id('node'),
          'name': name,
          'kind': tier == 'Special' ? 'special' : 'generic',
          'tier': tier,
          'slots': config['SLOTS'][tier],
          'tags': tier == 'Special' ? [a['hw'] ?? 'DATA'] : [],
          'downFor': 0,
          'provisionedTick': tick,
          if (tier == 'Special') 'hw': a['hw'] ?? 'DATA',
        });
        state['meters']['budget'] -= cost;
        state['stats']['moneySpent'] += cost;
        state['stats']['nodesProvisioned']++;
        say('ok', 'Node provisioned', name);
      case 'DECOMMISSION_NODE':
        final n = find(nodes, (n) => n['id'] == a['id']);
        if (n == null) return;
        if (nodes.length <= 1 || used(n['id']) > 0) {
          say(
            'warn',
            'Cannot decommission',
            'Keep at least one node, and move all pods first.',
          );
          return;
        }
        state['meters']['budget'] += (config['NODE_PROVISION'][n['tier']] * 0.5)
            .round();
        nodes.remove(n);
        state['nodes'] = nodes;
        say('info', 'Node decommissioned', '${n['name']} · 50% refunded');
      case 'NODE_ADD_TAG':
      case 'NODE_REMOVE_TAG':
        final n = find(nodes, (n) => n['id'] == a['id']);
        if (n == null || n['kind'] != 'generic') return;
        final tags = n['tags'] as List;
        if (action == 'NODE_REMOVE_TAG') {
          tags.remove(a['tag']);
        } else if (!tags.contains(a['tag']) && tags.length < 3) {
          tags.add(a['tag']);
        }
      case 'BUILD_IMAGE':
        build(a['repoId']);
      case 'BUILD_TICK':
        buildTick();
      case 'TICKET_REOPEN':
        final t = find(tickets, (t) => t['id'] == a['id']);
        if (t != null) t['status'] = 'todo';
      case 'TICKET_RESOLVE':
        final t = find(tickets, (t) => t['id'] == a['id']);
        if (t == null || t['status'] == 'done') return;
        if (!met(t)) {
          say('warn', 'Not yet', 'Acceptance criteria not met.');
          return;
        }
        final paid = t['paid'] == true;
        final pay = paid ? 0 : reward(t);
        final earned = paid
            ? 0
            : t['xp'] +
                  (t['type'] != 'bug' &&
                          t['dueTick'] != null &&
                          tick <= t['dueTick']
                      ? 10
                      : 0);
        if (!paid) {
          state['stats'][t['type'] == 'bug'
              ? 'incidentsResolved'
              : 'ticketsResolved']++;
          t['paidAmount'] = pay;
        }
        t.addAll({
          'status': 'done',
          'paid': true,
          'resolvedTick': tick,
          'regressed': false,
        });
        state['meters']['budget'] += pay;
        state['meters']['xp'] += earned;
        state['stats']['moneyEarned'] += pay;
        say('ok', 'Ticket resolved', '${t['id']} · +\$$pay · +$earned XP');
      case 'FORM_NEW':
        state['form'] = {
          'open': true,
          'editingId': null,
          'draft': draft(a['imageId']),
        };
      case 'FORM_EDIT':
        final s = find(services, (s) => s['id'] == a['id']);
        if (s == null) return;
        state['form'] = {
          'open': true,
          'editingId': s['id'],
          'draft': {
            for (final k in [
              'name',
              'imageId',
              'type',
              'replicas',
              'liveness',
              'readiness',
              'affinity',
              'spread',
              'podNodes',
            ])
              k: copy(s)[k],
          },
        };
      case 'FORM_SET':
        final d = state['form']['draft'] as Record?;
        if (d == null) return;
        final patch = Map<String, dynamic>.from(a['patch']);
        final editing = state['form']['editingId'];
        if (patch['imageId'] != null) {
          final i = image(patch['imageId']);
          if (editing != null &&
              i?['repoId'] != image(d['imageId'])?['repoId']) {
            patch.remove('imageId');
          } else if (i != null) {
            patch['name'] = find(repos, (r) => r['id'] == i['repoId'])!['name'];
          }
        }
        if (patch['type'] == 'Deployment' && !owns('deployments')) {
          patch.remove('type');
        }
        if (patch['affinity'] != null && !owns('affinity')) {
          patch.remove('affinity');
        }
        if (!owns('dashboard')) {
          patch.remove('liveness');
          patch.remove('readiness');
        }
        if (patch['replicas'] != null) {
          patch['replicas'] = clamp((patch['replicas'] as num).round(), 0, 8);
        }
        d.addAll(patch);
        if (d['spread'] == 'auto') {
          d['podNodes'] = spread(
            d['replicas'],
            affinity: d['affinity'],
            except: editing,
          );
        } else if (patch.containsKey('replicas')) {
          d['podNodes'] = (d['podNodes'] as List).take(d['replicas']).toList();
        }
      case 'FORM_PLACE':
        final d = state['form']['draft'] as Record?;
        if (d == null) return;
        final p = d['podNodes'] as List;
        if (a['delta'] > 0 && p.length < d['replicas']) p.add(a['nodeId']);
        if (a['delta'] < 0) {
          final i = p.lastIndexOf(a['nodeId']);
          if (i >= 0) p.removeAt(i);
        }
      case 'FORM_RESPREAD':
        final d = state['form']['draft'] as Record?;
        if (d != null) {
          d['podNodes'] = spread(
            d['replicas'],
            affinity: d['affinity'],
            except: state['form']['editingId'],
          );
        }
      case 'FORM_CLOSE':
        state['form'] = {'open': false, 'editingId': null, 'draft': null};
      case 'SERVICE_SAVE':
        saveService();
      case 'SERVICE_DELETE':
        state['services'] = services.where((s) => s['id'] != a['id']).toList();
        dispatch('FORM_CLOSE');
        say(
          'warn',
          'Service removed',
          'Standing ticket requirements still apply.',
        );
      case 'SERVICE_RESTART':
        final s = find(services, (s) => s['id'] == a['id']);
        if (s == null) return;
        s.addAll({
          'status': s['replicas'] == 0 ? 'Idle' : 'Pending',
          'ready': [0, s['replicas']],
          'settleIn': s['replicas'] == 0 ? 0 : 2,
          'errorRate': 0.002,
          'health': 100,
          'age': 0,
          'crashFor': 0,
          'restarts': s['restarts'] + 1,
        });
        say('info', 'Manual restart', s['name']);
      case 'BUY_UPGRADE':
        final u = find(upgrades, (u) => u['id'] == a['id']);
        if (u == null || !affordable(u)) return;
        u['owned'] = true;
        state['meters']['budget'] -= u['cost'];
        state['meters']['xp'] -= u['xp'];
        state['stats']['moneySpent'] += u['cost'];
        say('ok', 'Upgrade unlocked', u['name']);
        if (u['final'] == true && state['outcome'] == null) {
          state['outcome'] = {
            'kind': 'won',
            'atTick': tick,
            'reason': 'Secrets & Data Tier online — prod-east-1 runs itself.',
          };
          state['clock']['paused'] = true;
        }
      case 'BAILOUT':
        if (budget >= 0 || state['lastBailoutDay'] == day) return;
        state['lastBailoutDay'] = day;
        final cost = math.min(20, xp);
        state['meters']['budget'] += 1000;
        state['meters']['xp'] -= cost;
        state['stats']['bailouts']++;
        say(
          'warn',
          'Emergency funding',
          '+\$1,000 · −$cost XP · Finance is disappointed.',
        );
      case 'TICK':
        advance();
    }
  }

  void build(String repoId, {RandomStream? random}) {
    final repo = find(repos, (r) => r['id'] == repoId);
    if (repo == null) return;
    if (images.any((i) => i['repoId'] == repoId && i['building'] == true)) {
      return;
    }
    final v =
        images
            .where((i) => i['repoId'] == repoId)
            .fold<int>(0, (v, i) => math.max(v, i['version'] as int)) +
        1;
    final uid = id('img');
    final r = random ?? RandomStream(state['rng'] ^ (v * 7919));
    (state['images'] as List).add({
      'id': uid,
      'repoId': repoId,
      'version': v,
      'tag': '${repo['name']}:$v.0.0',
      'digest':
          'sha256:${r.integer(0x1000, 0xffff).toRadixString(16)}…${r.integer(0x10, 0xff).toRadixString(16)}',
      'builtTick': tick,
      'building': true,
      'progress': 0,
      'fast': owns('fast_build'),
    });
    say(
      'info',
      random == null ? 'Build started' : 'CI build',
      '${repo['name']} → v$v',
    );
  }

  void buildTick() {
    for (final i in images) {
      if (i['building'] != true) continue;
      i['progress'] = math.min(
        100,
        i['progress'] + (i['fast'] == true ? 50 : 20),
      );
      if (i['progress'] >= 100) {
        i['building'] = false;
        state['stats']['imagesBuilt']++;
        say('ok', 'Image built', i['tag']);
      }
    }
  }

  void saveService() {
    final d = state['form']['draft'] as Record?;
    if (d == null ||
        image(d['imageId']) == null ||
        image(d['imageId'])!['building'] == true) {
      return;
    }
    final editing = state['form']['editingId'] as String?;
    final previous = find(services, (s) => s['id'] == editing);
    if (editing == null && service(d['name']) != null) {
      say(
        'warn',
        'Already deployed',
        'Edit the existing service from Cluster.',
      );
      return;
    }
    final added = d['replicas'] - (previous?['replicas'] ?? 0);
    if (added > 0 && budget < added * 60) {
      say('bad', 'Budget too low', 'Clear a paying ticket before adding pods.');
      return;
    }
    if (d['replicas'] > totalFree(editing)) {
      say('bad', 'Out of slots', 'Provision another node first.');
      return;
    }
    if ((d['podNodes'] as List).length != d['replicas']) {
      say(
        'warn',
        'Placement incomplete',
        'Place every replica or use Auto-spread.',
      );
      return;
    }
    final capacity = free(editing);
    for (final node in d['podNodes']) {
      capacity[node] = (capacity[node] ?? 0) - 1;
      if (capacity[node]! < 0) {
        say('bad', 'Node over capacity', 'Redistribute replicas.');
        return;
      }
    }
    if (previous == null) {
      final uid = id('svc');
      final r = RandomStream(state['rng'] ^ state['seq']['uid']);
      (state['services'] as List).add({
        ...copy(d),
        'id': uid,
        'status': d['replicas'] == 0 ? 'Idle' : 'Pending',
        'ready': [0, d['replicas']],
        'restarts': 0,
        'errorRate': 0.002,
        'health': 100,
        'demand': r.range(30, 70),
        'age': 0,
        'settleIn': d['replicas'] == 0 ? 0 : 3,
        'incidentCooldown': 0,
        'crashFor': 0,
        'lowLoadTicks': 0,
        'createdTick': tick,
      });
      state['stats']['peakServices'] = math.max(
        state['stats']['peakServices'],
        services.length,
      );
      state['ui']['screen'] = 'infra';
      state['ui']['infraTab'] = 'cluster';
      say(
        'info',
        'Service scheduled',
        '${d['name']} → ${(d['podNodes'] as List).toSet().length} nodes',
      );
    } else {
      final rolling = owns('rolling');
      final settling =
          [
            'Idle',
            'Pending',
            'CrashLoopBackOff',
          ].contains(previous['status']) ||
          previous['settleIn'] > 0;
      final changed = d['imageId'] != previous['imageId'];
      previous.addAll(copy(d));
      if (d['replicas'] == 0) {
        previous.addAll({
          'status': 'Idle',
          'ready': [0, 0],
          'settleIn': 0,
          'crashFor': 0,
        });
      } else if (rolling && !settling) {
        previous['ready'] = [
          math.min(previous['ready'][0], d['replicas']),
          d['replicas'],
        ];
        previous['settleIn'] = 0;
        if (changed) {
          previous['age'] = 0;
          if (previous['status'] == 'Stale') previous['status'] = 'Running';
        }
      } else {
        previous['ready'] = [
          rolling ? math.min(previous['ready'][0], d['replicas']) : 0,
          d['replicas'],
        ];
        previous['status'] = 'Pending';
        previous['settleIn'] = rolling && previous['settleIn'] > 0
            ? previous['settleIn']
            : 3;
        previous['crashFor'] = 0;
        if (changed) previous['age'] = 0;
      }
      say('info', rolling ? 'Rolling update' : 'Redeploying', d['name']);
    }
    dispatch('FORM_CLOSE');
  }

  String exportSave([String label = 'Mobile save']) {
    final clean = copy(state);
    clean['clock']['paused'] = true;
    clean['toasts'] = [];
    clean['form'] = {'open': false, 'editingId': null, 'draft': null};
    return jsonEncode({
      'magic': 'k8sgame-save',
      'version': 1,
      'savedAt': DateTime.now().millisecondsSinceEpoch,
      'label': label,
      'state': clean,
    });
  }
}
