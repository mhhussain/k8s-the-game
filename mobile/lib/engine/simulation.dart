part of 'game.dart';

extension Simulation on Game {
  void advance() {
    if (ended) return;
    final before = copy(state);
    final rng = RandomStream(state['rng']);
    rng.next();
    final drama = state['settings']['drama'] as num;
    state['clock']['tick']++;
    state['clock']['mins'] = (state['clock']['mins'] + 30) % 1440;
    void automation(String svc, String kind, String title, String message) {
      final stamps = state['toastStamp'] as Record;
      if ((stamps[svc] ?? -999) + 6 > tick) {
        final previous = state['toasts'];
        say(kind, title, message);
        state['toasts'] = previous;
        return;
      }
      stamps[svc] = tick;
      say(kind, title, message);
    }

    final landed = records(state['pending'])
        .where((p) => tick >= p['atTick'])
        .toList();
    state['pending'] = records(state['pending'])
        .where((p) => tick < p['atTick'])
        .toList();
    for (final p in landed) {
      final t = copy(p['ticket']);
      t['createdTick'] = tick;
      t['dueTick'] ??= tick + 48 * config['TICKET_DUE_DAYS'][t['prio']];
      (state['tickets'] as List).add(t);
      if (t['first'] == true) {
        state['firstBeat'] = {'id': t['id'], 'title': t['title']};
        state['clock']['paused'] = true;
      } else {
        say('info', 'New ticket', '${t['id']} · ${t['title']}');
        if (state['settings']['pauseOnTicket']) state['clock']['paused'] = true;
      }
    }
    if ((state['pending'] as List).isEmpty && tick >= state['nextProcTick']) {
      if (tickets
              .where((t) => t['status'] == 'todo' && t['type'] != 'bug')
              .length <
          2) {
        final t = procedural(rng);
        if (t != null) {
          state['seq']['ticket']++;
          (state['tickets'] as List).add(t);
          say('info', 'New ticket', '${t['id']} · ${t['title']}');
          if (state['settings']['pauseOnTicket']) {
            state['clock']['paused'] = true;
          }
        }
      }
      state['nextProcTick'] = tick + rng.integer(60, 100);
    }
    state['events'] = records(state['events'])
        .where((e) => e['endTick'] > tick - 2)
        .toList();
    for (final n in nodes) {
      if (n['downFor'] > 0) n['downFor']--;
    }
    if (services.any((s) => s['replicas'] > 0) &&
        nodes.length >= 2 &&
        nodes.every((n) => n['downFor'] == 0) &&
        tick - state['lastOutageTick'] >= 96 &&
        rng.chance(0.02 * (0.6 + drama * 0.8))) {
      final victim = rng.pick(nodes);
      final duration = rng.integer(5, 9);
      victim['downFor'] = duration;
      state['lastOutageTick'] = tick;
      (state['events'] as List).add({
        'id': 'ev-$tick',
        'kind': 'outage',
        'title': '${victim['name']} went offline',
        'startTick': tick,
        'endTick': tick + duration,
        'nodeId': victim['id'],
        'announced': true,
      });
      say(
        'bad',
        'Node outage',
        '${victim['name']} is unreachable. Deployments re-home; bare Pods go down.',
      );
    }
    for (final n in records(before['nodes'])) {
      if (n['downFor'] == 1 &&
          find(nodes, (x) => x['id'] == n['id'])?['downFor'] == 0) {
        say('ok', 'Node recovered', '${n['name']} is back online.');
      }
    }
    final sale = find(
      records(state['events']).reversed,
      (e) => e['kind'] == 'sale',
    );
    final saleDue =
        sale == null || tick - sale['startTick'] > rng.integer(110, 180);
    if (saleDue &&
        services.any((s) => s['replicas'] > 0) &&
        tick > 40 &&
        rng.chance(0.08)) {
      final victim = rng.pick(
        services.where((s) => s['replicas'] > 0).toList(),
      );
      (state['events'] as List).add({
        'id': 'ev-$tick',
        'kind': 'sale',
        'title': 'Flash sale: ${victim['name']}',
        'startTick': tick + 24,
        'endTick': tick + 44,
        'svc': victim['name'],
        'mult': 2.2,
        'announced': true,
      });
      say(
        'warn',
        'Heads-up from Growth',
        'Flash sale hits ${victim['name']} in ~12h — expect 2.2× traffic.',
      );
    }
    for (final e in records(state['events'])) {
      if (e['kind'] == 'sale' && e['startTick'] == tick) {
        say(
          'warn',
          'Flash sale live',
          '${e['svc']} is getting ${e['mult']}× traffic.',
        );
      }
    }
    if (owns('ci_autobuild') && tick % 40 == 0) {
      final live = repos
          .where(
            (r) =>
                services.any(
                  (s) => s['name'] == r['name'] && s['replicas'] > 0,
                ) &&
                !images.any(
                  (i) => i['repoId'] == r['id'] && i['building'] == true,
                ),
          )
          .toList();
      if (live.isNotEmpty) build(rng.pick(live)['id'], random: rng);
    }
    if (owns('rebalance') && tick % 6 == 0) {
      var moved = false;
      for (final s in services) {
        if (s['replicas'] == 0) continue;
        final fresh = spread(
          s['replicas'],
          affinity: s['affinity'],
          except: s['id'],
        );
        final after = {...s, 'podNodes': fresh};
        final oldBad = misplaced(s) + offline(s);
        final newBad = misplaced(after) + offline(after);
        if (newBad < oldBad ||
            (fresh.toSet().length > pods(s).toSet().length &&
                oldBad == 0 &&
                newBad == 0)) {
          s['podNodes'] = fresh;
          moved = true;
        }
      }
      if (moved) {
        state['flash']['rebalance'] = tick;
        automation(
          '_rebalance',
          'info',
          'Auto-rebalance',
          'Pods moved to even out the cluster.',
        );
      }
    }
    for (final s in services) {
      if (s['type'] != 'Deployment' || s['replicas'] == 0 || offline(s) == 0) {
        continue;
      }
      final cap = free(s['id']);
      final p = pods(s);
      final up = nodes.where((n) => n['downFor'] == 0).toList();
      for (final nid in p) {
        if (up.any((n) => n['id'] == nid)) cap[nid] = cap[nid]! - 1;
      }
      var moved = false;
      for (var i = 0; i < p.length; i++) {
        if (up.any((n) => n['id'] == p[i])) continue;
        final order = [...up]
          ..sort((a, b) {
            final am =
                s['affinity'] == null ||
                    (a['tags'] as List).contains(s['affinity'])
                ? 0
                : 1;
            final bm =
                s['affinity'] == null ||
                    (b['tags'] as List).contains(s['affinity'])
                ? 0
                : 1;
            return am != bm ? am - bm : cap[b['id']]! - cap[a['id']]!;
          });
        final target = find(order, (n) => cap[n['id']]! > 0);
        if (target != null) {
          p[i] = target['id'];
          cap[p[i]] = cap[p[i]]! - 1;
          moved = true;
        }
      }
      s['podNodes'] = p;
      if (moved) {
        automation(
          s['name'],
          'info',
          'Pods re-homed',
          '${s['name']} moved off the failed node.',
        );
      }
    }
    // Use a snapshot for demand/placement parity; reserve added autoscaler slots
    // sequentially to avoid the web engine's simultaneous-scale oversubscription.
    final sim = Game.fromState(copy(state));
    num dailyRevenue = 0;
    for (final s in services) {
      if (s['replicas'] == 0) {
        s.addAll({
          'status': 'Idle',
          'ready': [0, 0],
          'errorRate': 0,
          'crashFor': 0,
        });
        continue;
      }
      final mis = sim.misplaced(s), off = sim.offline(s);
      final maxReady = math.max(0, s['replicas'] - mis - off);
      final traffic = sim.demand(s);
      if (s['settleIn'] > 0) {
        s['settleIn']--;
        s['ready'] = [
          math.min(s['ready'][0] + (s['replicas'] / 2).ceil(), maxReady),
          s['replicas'],
        ];
        s['status'] = 'Pending';
        s['errorRate'] = s['readiness']
            ? 0.004
            : clamp(s['errorRate'] * 0.5 + 0.08, 0, 0.3);
        if (s['settleIn'] <= 0) {
          if (maxReady == 0) {
            s.addAll({
              'status': 'CrashLoopBackOff',
              'ready': [0, s['replicas']],
              'health': 30,
              'errorRate': 0.4,
            });
          } else if (mis + off > 0) {
            s.addAll({
              'status': 'Degraded',
              'ready': [maxReady, s['replicas']],
              'health': 62,
              'errorRate': 0.12,
            });
          } else {
            s.addAll({
              'status': 'Running',
              'ready': [s['replicas'], s['replicas']],
              'health': 100,
              'errorRate': s['readiness'] ? 0.002 : 0.01,
            });
          }
        }
        continue;
      }
      s['age']++;
      if (s['incidentCooldown'] > 0) s['incidentCooldown']--;
      s['demand'] = clamp(s['demand'] + rng.range(-2.2, 2.8), 10, 320);
      num load =
          traffic /
          math.max(
            s['replicas'] *
                55 *
                (math.max(s['ready'][0], 1) / math.max(s['replicas'], 1)),
            1,
          );
      if (owns('autoscale') && s['type'] == 'Deployment') {
        if (load > 0.85 && s['replicas'] < 10) {
          if (totalFree() <= 0) {
            automation(
              s['name'],
              'warn',
              'Autoscaler blocked',
              '${s['name']} needs a replica but the cluster is out of slots.',
            );
          } else if (budget < 0) {
            automation(
              s['name'],
              'warn',
              'Autoscaler blocked',
              '${s['name']} needs a replica but the budget is negative.',
            );
          } else {
            s['replicas']++;
            s['podNodes'] = spread(
              s['replicas'],
              affinity: s['affinity'],
              except: s['id'],
            );
            s['ready'] = [s['ready'][0], s['replicas']];
            s['lowLoadTicks'] = 0;
            automation(
              s['name'],
              'info',
              'Autoscaled up',
              '${s['name']} → ${s['replicas']} replicas',
            );
            load = traffic / (s['replicas'] * 55);
          }
        } else if (load < 0.30 && s['replicas'] > 2) {
          s['lowLoadTicks']++;
          if (s['lowLoadTicks'] >= 8) {
            s['replicas']--;
            s['podNodes'] = pods(s);
            s['ready'] = [
              math.min(s['ready'][0], s['replicas']),
              s['replicas'],
            ];
            s['lowLoadTicks'] = 0;
            automation(
              s['name'],
              'info',
              'Autoscaled down',
              '${s['name']} → ${s['replicas']} replicas (traffic faded)',
            );
          }
        } else {
          s['lowLoadTicks'] = 0;
        }
      }
      if (maxReady == 0) {
        s.addAll({
          'status': 'CrashLoopBackOff',
          'ready': [0, s['replicas']],
          'errorRate': clamp(s['errorRate'] * 0.6 + 0.16, 0.2, 0.9),
          'health': clamp(s['health'] - 6, 0, 100),
        });
        continue;
      }
      if (mis + off > 0) {
        s.addAll({
          'status': 'Degraded',
          'ready': [math.min(s['ready'][0] + 1, maxReady), s['replicas']],
          'errorRate': clamp(s['errorRate'] * 0.6 + 0.04, 0, 0.9),
          'health': clamp(s['health'] - 1, 30, 100),
        });
        dailyRevenue +=
            math.min(traffic, s['ready'][0] * 55) * (1 - s['errorRate']) * 3.2;
        continue;
      }
      final stale = !sim.latest(s);
      if (stale) {
        if (owns('rolling') && ['Running', 'Stale'].contains(s['status'])) {
          final current = image(s['imageId']);
          final newest = find(
            latestImages,
            (i) => i['repoId'] == current?['repoId'],
          );
          if (newest != null) {
            s['imageId'] = newest['id'];
            s['status'] = 'Running';
            automation(
              s['name'],
              'ok',
              'Rolling update',
              '${s['name']} → ${newest['tag']}',
            );
          }
        } else if (s['status'] == 'Running' &&
            s['age'] > 16 &&
            rng.chance(0.05)) {
          s['status'] = 'Stale';
        }
      }
      num delta = load > 1.1 ? -(load - 1) * 9 : 4;
      if (s['status'] == 'Stale') delta -= 1.5;
      s['health'] = clamp(s['health'] + delta, 0, 100);
      final error =
          (load > 1 ? (load - 1) * 0.4 : (s['readiness'] ? 0.002 : 0.006)) +
          (s['status'] == 'Stale' ? 0.03 : 0);
      s['errorRate'] = clamp(s['errorRate'] * 0.6 + error * 0.4, 0, 0.95);
      if (s['status'] != 'CrashLoopBackOff') {
        final risk =
            (1 - s['health'] / 100) *
            (0.25 + drama * 0.35) *
            (s['liveness'] ? 0.7 : 1);
        if (s['incidentCooldown'] == 0 && rng.chance(risk * 0.5)) {
          s['status'] = 'CrashLoopBackOff';
          s['restarts'] += rng.integer(1, 3);
          s['ready'] = [math.max(0, s['ready'][0] - 1), s['replicas']];
          s['incidentCooldown'] = 4;
          s['crashFor'] = s['type'] == 'Deployment'
              ? (s['liveness'] ? 1 : 3)
              : -1;
        }
      }
      if (s['status'] == 'CrashLoopBackOff') {
        final heal =
            (owns('self_heal') && rng.chance(0.5)) || s['crashFor'] == 0;
        if (s['crashFor'] > 0) s['crashFor']--;
        if (heal) {
          s.addAll({
            'status': 'Running',
            'ready': [maxReady, s['replicas']],
            'health': clamp(s['health'] + 25, 0, 100),
            'errorRate': 0.01,
            'crashFor': 0,
          });
          automation(
            s['name'],
            'ok',
            owns('self_heal') ? 'Self-healed' : 'Pod recreated',
            '${s['name']} recovered',
          );
        }
      } else if (s['status'] == 'Stale' &&
          s['health'] > 55 &&
          load < 0.9 &&
          !stale) {
        s['status'] = 'Running';
      } else if (s['status'] == 'Degraded' && load < 0.9) {
        s['status'] = 'Running';
      } else if (s['status'] == 'Running' && load > 1.2 && s['health'] < 60) {
        s['status'] = 'Degraded';
      }
      if (s['status'] == 'Running' && s['ready'][0] < maxReady) {
        s['ready'] = [math.min(s['ready'][0] + 1, maxReady), s['replicas']];
      }
      if (s['status'] != 'CrashLoopBackOff') {
        dailyRevenue +=
            math.min(traffic, s['ready'][0] * 55) * (1 - s['errorRate']) * 3.2;
      }
    }
    for (final n in nodes) {
      final previous = find(
        records(before['nodes']),
        (x) => x['id'] == n['id'],
      );
      if (previous == null || previous['downFor'] <= 0) continue;
      final hosted = records(before['services'])
          .where((s) => pods(s).contains(n['id']));
      final hit = hosted.any((s) {
        final now = find(services, (x) => x['id'] == s['id']);
        return now != null && now['replicas'] > 0 && now['ready'][0] == 0;
      });
      final felt = previous['outageFelt'] == true || hit;
      if (n['downFor'] > 0) {
        n['outageFelt'] = felt;
      } else {
        state['stats'][felt ? 'outagesFelt' : 'outagesSurvived']++;
        n['outageFelt'] = false;
        if (!felt) {
          say(
            'ok',
            'Outage survived',
            '${n['name']} failed and nothing went down. That’s HA.',
          );
        }
      }
    }
    for (final s in services) {
      if (tickets
              .where((t) => t['type'] == 'bug' && t['status'] == 'todo')
              .length >=
          6) {
        break;
      }
      if (!(s['status'] == 'CrashLoopBackOff' ||
          s['status'] == 'Stale' ||
          s['errorRate'] > 0.18)) {
        continue;
      }
      if (tickets.any(
        (t) =>
            t['type'] == 'bug' &&
            t['status'] == 'todo' &&
            t['svc'] == s['name'],
      )) {
        continue;
      }
      if (!rng.chance(0.08 + drama * 0.08)) continue;
      final t = bug(s, demand(s) > s['replicas'] * 55);
      (state['tickets'] as List).add(t);
      state['stats']['incidentsRaised']++;
      say('bad', 'New incident', '${t['id']} · ${s['name']}');
    }
    for (final t in [...tickets]) {
      if (t['status'] != 'done' ||
          t['type'] == 'bug' ||
          t['regressed'] == true) {
        continue;
      }
      if (t['resolvedTick'] != null && tick - t['resolvedTick'] < 6) continue;
      if (met(t)) continue;
      if (tickets.any(
        (b) =>
            b['type'] == 'bug' && b['status'] == 'todo' && b['svc'] == t['svc'],
      )) {
        continue;
      }
      final reg = {
        ...copy(t),
        'id': 'BUG-${state['seq']['bug']++}',
        'type': 'bug',
        'prio': 'high',
        'reward': 0,
        'xp': 0,
        'status': 'todo',
        'paid': false,
        'createdTick': tick,
        'title': 'Regression: ${t['title']}',
        'body':
            '${t['requester'].split(' ·')[0]} is back. “${t['title']}” was closed, but it isn’t true anymore.',
        'hint': 'Restore every criterion. Fixing what you broke pays no bonus.',
      };
      reg.remove('resolvedTick');
      reg.remove('dueTick');
      reg.remove('regressed');
      (state['tickets'] as List).add(reg);
      t['regressed'] = true;
      state['stats']['incidentsRaised']++;
      say('bad', 'Regression', '${reg['id']} · ${t['svc']}');
      if (state['settings']['pauseOnTicket']) state['clock']['paused'] = true;
    }
    for (final t in tickets) {
      if (t['regressed'] == true &&
          !tickets.any(
            (b) =>
                b['type'] == 'bug' &&
                b['status'] == 'todo' &&
                b['svc'] == t['svc'],
          )) {
        t['regressed'] = false;
        t['resolvedTick'] = tick;
      }
    }
    final bad = services.any((s) => s['status'] == 'CrashLoopBackOff');
    final warn = services.any(
      (s) => ['Stale', 'Degraded'].contains(s['status']),
    );
    state['meters']['sla'] = clamp(
      state['meters']['sla'] +
          (bad
              ? -rng.range(0.15, 0.5)
              : warn
              ? -rng.range(0.02, 0.12)
              : 0.08),
      80,
      100,
    );
    state['stats']['worstSla'] = math.min(
      state['stats']['worstSla'],
      state['meters']['sla'],
    );
    state['meters']['budget'] += dailyRevenue / 48 - upkeep / 48;
    state['stats']['revenueEarned'] += dailyRevenue / 48;
    if (tick % 48 == 0) {
      final healthy = services
          .where(
            (s) =>
                s['status'] == 'Running' &&
                s['ready'][0] == s['ready'][1] &&
                s['replicas'] > 0,
          )
          .length;
      if (healthy > 0) {
        state['meters']['xp'] += healthy * 4;
        say(
          'ok',
          'Day ${day - 1} wrapped',
          '$healthy healthy services · +${healthy * 4} XP',
        );
      }
    }
    if (before['meters']['budget'] >= 0 && budget < 0) {
      say(
        'bad',
        'Budget negative',
        'Clear a ticket, trim pods, or request emergency funding.',
      );
    }
    state['budgetDebtTicks'] = budget < -2000
        ? state['budgetDebtTicks'] + 1
        : 0;
    if (state['outcome'] == null && state['budgetDebtTicks'] >= 96) {
      state['outcome'] = {
        'kind': 'lost',
        'atTick': tick,
        'reason':
            'Two days in deep debt. Finance pulled the plug on prod-east-1.',
      };
      state['clock']['paused'] = true;
    }
    if (bad && state['flash']['bad'] == null) state['flash']['bad'] = tick;
    state['stats']['peakServices'] = math.max(
      state['stats']['peakServices'],
      services.length,
    );
    state['rng'] = rng.seed;
  }
}
