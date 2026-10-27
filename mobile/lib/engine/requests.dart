part of 'game.dart';

extension Requests on Game {
  Record criterion(
    String kind,
    Record s,
    String label, {
    int? n,
    String? tag,
  }) => {'kind': kind, 'svc': s['name'], 'label': label, 'n': ?n, 'tag': ?tag};
  Record latestCriterion(Record s) => criterion(
    'latest',
    s,
    '${s['name']} on v${latestVersion(s)} or newer',
    n: latestVersion(s),
  );
  Record request(
    String id,
    String requester,
    String color,
    String prio,
    Record s,
    String title,
    String body,
    String hint,
    int reward,
    int xp,
    List<Record> criteria,
  ) => {
    'id': id,
    'type': 'new',
    'requester': requester,
    'avatar': color,
    'prio': prio,
    'svc': s['name'],
    'title': title,
    'body': body,
    'hint': hint,
    'reward': reward,
    'xp': xp,
    'criteria': criteria,
    'status': 'todo',
    'createdTick': tick,
    'paid': false,
  };
  Record? procedural(RandomStream rng) {
    final requesters = [
      ['Priya · Finance', '#4C6EF5'],
      ['Dana · Growth', '#5BA641'],
      ['Marcus · Compliance', '#D2742B'],
      ['Sam · Ops', '#C85B5B'],
      ['Lena · Product', '#9B5DE5'],
      ['Theo · Support', '#0E9BB8'],
      ['June · Security', '#E08A00'],
    ];
    final req = rng.pick(requesters);
    final id = 'TCK-${state['seq']['ticket']}';
    final busy = tickets
        .where((t) => t['status'] == 'todo')
        .map((t) => t['svc'])
        .toSet();
    final running = services
        .where((s) => s['replicas'] > 0 && !busy.contains(s['name']))
        .toList();
    final notDeployed = repos
        .where((r) => service(r['name']) == null && !busy.contains(r['name']))
        .toList();
    final weights = [
      3,
      3,
      owns('deployments') ? 3 : 1,
      2,
      owns('dashboard') ? 2 : 0,
      2,
    ];
    for (var attempt = 0; attempt < 8; attempt++) {
      var roll = rng.next() * weights.fold(0, (a, b) => a + b);
      var choice = 0;
      for (var i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) {
          choice = i;
          break;
        }
      }
      Record? t;
      switch (choice) {
        case 0:
          if (notDeployed.isEmpty) continue;
          final s = rng.pick(notDeployed);
          final prio = rng.pick(['med', 'low', 'high']);
          final flavors = [
            [
              'Ship ${s['name']}',
              '${s['desc']} Product wants it live this week — nothing fancy, just serving.',
              'Build the image, author a service, make sure it reports Running.',
            ],
            [
              '${s['name']} needs to exist in prod',
              'Someone demoed ${s['name']} to a customer. Now it has to actually run. “Just like the demo.”',
              '“Just like the demo” = running and healthy. Build it, deploy it, keep it green.',
            ],
          ];
          final f = rng.pick(flavors);
          t = request(
            id,
            req[0],
            req[1],
            prio,
            s,
            f[0],
            f[1],
            f[2],
            rng.integer(60, 90) * 10,
            rng.integer(3, 5) * 10,
            [criterion('running', s, '${s['name']} is running')],
          );
          t['repo'] = s['id'];
        case 1:
          final candidates = running.where((s) => s['replicas'] < 7).toList();
          if (candidates.isEmpty) continue;
          final s = rng.pick(candidates);
          final n = math.min(8, (s['replicas'] as int) + rng.integer(1, 2));
          final f = rng.pick([
            [
              '${s['name']} is "feeling slow"',
              'Support says ${s['name']} is feeling slow in the afternoons. They don’t have numbers, just vibes. Loud vibes.',
              '“Feeling slow in the afternoons” = peak-hour load. More replicas = more capacity.',
            ],
            [
              'Capacity for ${s['name']} before the launch',
              'There’s a launch next week and ${s['name']} is in the critical path. Nobody wants to explain a timeout to the CEO.',
              'Give it headroom now. Each replica adds ~55 req/s.',
            ],
          ]);
          t = request(
            id,
            req[0],
            req[1],
            rng.pick(['med', 'high']),
            s,
            f[0],
            f[1],
            f[2],
            rng.integer(55, 80) * 10,
            rng.integer(3, 5) * 10,
            [
              criterion('running', s, '${s['name']} is running'),
              criterion('replicas', s, 'Capacity — ≥$n replicas', n: n),
            ],
          );
        case 2:
          final candidates = running
              .where(
                (s) =>
                    !(s['type'] == 'Deployment' &&
                        s['replicas'] >= 2 &&
                        pods(s).toSet().length >= 2),
              )
              .toList();
          if (candidates.isEmpty) continue;
          final s = rng.pick(candidates);
          t = request(
            id,
            req[0],
            req[1],
            'high',
            s,
            '${s['name']} cannot go down again',
            '${s['name']} blipped during a customer call. The account team is “very keen” that it never happens again.',
            '“Never again” = high availability: a Deployment, ≥2 replicas, spread over ≥2 nodes.',
            rng.integer(90, 120) * 10,
            rng.integer(5, 7) * 10,
            [
              criterion('running', s, '${s['name']} is running'),
              criterion('ha', s, 'High availability'),
            ],
          );
        case 3:
          final candidates = running
              .where((s) => s['affinity'] == null)
              .toList();
          if (candidates.isEmpty) continue;
          final s = rng.pick(candidates);
          final tag = rng.pick(['x86', 'ARM', 'GPU', 'DATA']);
          final why = {
            'x86': 'a vendor library that “only works on x86, don’t ask”',
            'ARM': 'the cost-savings initiative (“ARM is cheaper, make it happen”)',
            'GPU': 'the new ML feature that “needs a GPU, obviously”',
            'DATA': 'the auditors, who want it “next to the data”',
          };
          t = request(
            id,
            req[0],
            req[1],
            'med',
            s,
            'Run ${s['name']} on $tag hardware',
            '${s['name']} has to move onto $tag because of ${why[tag]}. Every replica, please.',
            'Every replica on a $tag-tagged node. Tag a generic node $tag (or provision a special $tag node) and re-place the pods.',
            rng.integer(70, 95) * 10,
            rng.integer(4, 6) * 10,
            [
              criterion('running', s, '${s['name']} is running'),
              criterion(
                'node_tag',
                s,
                'Every replica on a $tag node',
                tag: tag,
              ),
            ],
          );
        case 4:
          final candidates = running
              .where((s) => !(s['liveness'] && s['readiness']))
              .toList();
          if (candidates.isEmpty) continue;
          final s = rng.pick(candidates);
          t = request(
            id,
            req[0],
            req[1],
            'low',
            s,
            '${s['name']}: "make it self-aware"',
            'Ops reviewed ${s['name']} and wrote “no health checks?!” in red. They want it to know when it’s broken.',
            'Turn on both health probes (Liveness + Readiness) in the service form. Probes unlock with the Service Dashboard.',
            rng.integer(45, 65) * 10,
            rng.integer(3, 4) * 10,
            [
              criterion('running', s, '${s['name']} is running'),
              criterion('probes', s, 'Liveness + Readiness probes enabled'),
            ],
          );
        case 5:
          final candidates = running
              .where((s) => version(s) < latestVersion(s))
              .toList();
          if (candidates.isEmpty) continue;
          final s = rng.pick(candidates);
          t = request(
            id,
            req[0],
            req[1],
            'med',
            s,
            'Roll out the new ${s['name']} build',
            'Engineering shipped a new ${s['name']} build with “the fix”. Nobody knows which fix. Ship it anyway.',
            'Redeploy the service on the latest image from the Registry — or unlock Rolling Updates to do it automatically.',
            rng.integer(50, 70) * 10,
            rng.integer(3, 4) * 10,
            [
              latestCriterion(s),
              criterion('stable', s, '${s['name']} healthy — all pods ready'),
            ],
          );
      }
      if (t != null) {
        if (service(t['svc']) != null) t['type'] = 'change';
        t['dueTick'] = tick + 48 * config['TICKET_DUE_DAYS'][t['prio']];
        return t;
      }
    }
    return null;
  }

  Record bug(Record s, bool overload) {
    final id = 'BUG-${state['seq']['bug']++}';
    final stable = criterion(
      'stable',
      s,
      '${s['name']} healthy again — no errors, all pods ready',
    );
    final t = request(
      id,
      'Monitoring · auto',
      '#DC3F32',
      overload ? 'high' : 'med',
      s,
      '${s['name']} pod keeps dying',
      '${s['name']} is in a crash loop and restarting repeatedly. Get it stable.',
      'Restart it to clear the loop. If it keeps happening, it needs more redundancy — or Auto-Remediation to self-heal.',
      overload ? 650 : 500,
      35,
      [stable],
    );
    t['type'] = 'bug';
    if (misplaced(s) > 0) {
      t.addAll({
        'title': '${s['name']} has pods that won’t go live',
        'body':
            '${misplaced(s)} replicas need ${s['affinity']} hardware but are placed on other nodes.',
        'hint':
            'Tag a node ${s['affinity']}, provision matching hardware, or re-place the replicas.',
      });
    } else if (s['status'] == 'Stale') {
      t.addAll({
        'title': '${s['name']} is serving errors',
        'body':
            'Users report ${s['name']} is flaky and returning stale data. It looks out of date.',
        'hint': 'Redeploy on the latest image, or unlock Rolling Updates.',
        'reward': 150,
        'xp': 10,
        'prio': 'med',
        'criteria': [latestCriterion(s), stable],
      });
    } else if (overload) {
      final n = math.min((s['replicas'] as int) + 1, 8);
      t.addAll({
        'title': '${s['name']} is crashing under load',
        'body': 'Pages are timing out during busy periods.',
        'hint': 'Add replicas or unlock the Autoscaler.',
        'criteria': [
          criterion('replicas', s, 'More capacity — ≥$n replicas', n: n),
          stable,
        ],
      });
    } else if (s['type'] == 'Pod') {
      t.addAll({
        'title': '${s['name']} pod died and stayed dead',
        'body': 'This is a bare Pod. Nothing will bring it back automatically.',
        'hint':
            'Restart it to clear the crash. A Deployment recreates dead pods.',
      });
    }
    return t;
  }
}
