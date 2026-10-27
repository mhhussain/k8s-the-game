import 'dart:convert';

import 'game.dart';
import 'catalog.dart';

/// Import is transactional: validate the entire candidate before replacing play.
class SaveCodec {
  static const maxBytes = 2 * 1024 * 1024;
  static Record decode(String text) {
    if (utf8.encode(text).length > maxBytes) {
      throw const FormatException('Save is larger than 2 MB.');
    }
    final raw = jsonDecode(text);
    if (raw is! Map<String, dynamic> ||
        !['k8sgame-save', 'cluster-save'].contains(raw['magic']) ||
        raw['state'] is! Map<String, dynamic>) {
      throw const FormatException('Not a Kubernetes: The Game save.');
    }
    if (raw['version'] != 1) {
      throw const FormatException('This save version is not supported.');
    }
    final s = raw['state'] as Record;
    final fresh = freshState();
    void fail(String field) =>
        throw FormatException('Invalid save field: $field');
    num number(dynamic x, String field, {num min = -1e12, num max = 1e12}) {
      if (x is! num || !x.isFinite || x < min || x > max) fail(field);
      return x as num;
    }

    int integer(dynamic x, String field, {int min = 0, int max = 1000000000}) {
      final n = number(x, field, min: min, max: max);
      if (n != n.round()) fail(field);
      return n.toInt();
    }

    String string(dynamic x, String field) {
      if (x is! String || x.isEmpty || x.length > 2000) fail(field);
      return x as String;
    }

    List<Record> list(String key, {int max = 10000}) {
      final v = s[key];
      if (v is! List || v.length > max || v.any((x) => x is! Record)) fail(key);
      return (v as List).cast<Record>();
    }

    for (final key in ['clock', 'meters', 'seq', 'settings', 'stats']) {
      if (s[key] is! Record) fail(key);
    }
    for (final key in ['tick', 'mins', 'speed']) {
      integer(s['clock'][key], 'clock.$key');
    }
    if (![1, 2, 4].contains(s['clock']['speed']) ||
        s['clock']['mins'] >= 1440) {
      fail('clock');
    }
    for (final k in ['budget', 'sla', 'xp']) {
      number(s['meters'][k], 'meters.$k');
    }
    number(s['settings']['drama'], 'drama', min: 0, max: 1);
    if (s['settings']['pauseOnTicket'] is! bool) fail('pauseOnTicket');
    for (final k in (fresh['seq'] as Record).keys) {
      integer(s['seq'][k], 'seq.$k');
    }
    for (final k in (fresh['stats'] as Record).keys) {
      number(s['stats'][k] ?? 0, 'stats.$k', min: 0);
    }
    integer(s['rng'], 'rng', max: 0xffffffff);
    final nodes = list('nodes', max: 256),
        images = list('images', max: 10000),
        services = list('services', max: 256);
    if (nodes.isEmpty) fail('nodes');
    final nodeIds = <String>{},
        imageIds = <String>{},
        serviceIds = <String>{},
        names = <String>{};
    void unique(Set<String> ids, dynamic id, String field) {
      if (!ids.add(string(id, field))) fail('duplicate $field');
    }

    const hw = ['x86', 'ARM', 'GPU', 'DATA'];
    for (final n in nodes) {
      unique(nodeIds, n['id'], 'node.id');
      string(n['name'], 'node.name');
      if (!['generic', 'special'].contains(n['kind']) ||
          !['Normal', 'Large', 'Special'].contains(n['tier'])) {
        fail('node type');
      }
      integer(n['slots'], 'node.slots', min: 1, max: 16);
      integer(n['downFor'] ?? 0, 'node.downFor', max: 10000);
      if (n['tags'] is! List ||
          (n['tags'] as List).length > 3 ||
          (n['tags'] as List).any((t) => !hw.contains(t))) {
        fail('node.tags');
      }
      n['downFor'] ??= 0;
      n['provisionedTick'] ??= 0;
    }
    final repoIds = records(fresh['repos']).map((r) => r['id']).toSet();
    for (final i in images) {
      unique(imageIds, i['id'], 'image.id');
      if (!repoIds.contains(i['repoId'])) fail('image.repoId');
      integer(i['version'], 'image.version', min: 1);
      number(i['progress'], 'image.progress', min: 0, max: 100);
      integer(i['builtTick'], 'image.builtTick');
      string(i['tag'], 'image.tag');
      string(i['digest'], 'image.digest');
      if (i['building'] is! bool || i['fast'] is! bool) fail('image flags');
    }
    const statuses = [
      'Running',
      'Stale',
      'Degraded',
      'Pending',
      'CrashLoopBackOff',
      'Terminating',
      'Idle',
    ];
    for (final v in services) {
      unique(serviceIds, v['id'], 'service.id');
      unique(names, v['name'], 'service.name');
      if (!imageIds.contains(v['imageId'])) fail('service.imageId');
      if (!['Pod', 'Deployment'].contains(v['type']) ||
          !statuses.contains(v['status'])) {
        fail('service type/status');
      }
      final count = integer(v['replicas'], 'service.replicas', max: 10);
      if (v['podNodes'] is! List ||
          (v['podNodes'] as List).length != count ||
          (v['podNodes'] as List).any((id) => !nodeIds.contains(id))) {
        fail('service placement');
      }
      if (v['ready'] is! List || (v['ready'] as List).length != 2) {
        fail('service.ready');
      }
      integer(v['ready'][0], 'ready', max: count);
      if (v['ready'][1] != count) fail('ready total');
      if (v['liveness'] is! bool ||
          v['readiness'] is! bool ||
          !['auto', 'manual'].contains(v['spread']) ||
          (v['affinity'] != null && !hw.contains(v['affinity']))) {
        fail('service settings');
      }
      for (final key in [
        'restarts',
        'age',
        'settleIn',
        'incidentCooldown',
        'lowLoadTicks',
        'createdTick',
      ]) {
        v[key] ??= 0;
        integer(v[key], 'service.$key');
      }
      v['crashFor'] ??= 0;
      integer(v['crashFor'], 'crashFor', min: -1);
      number(v['errorRate'], 'errorRate', min: 0, max: 1);
      number(v['health'], 'health', min: 0, max: 100);
      number(v['demand'], 'demand', min: 0, max: 10000);
    }
    final tickets = list('tickets');
    final ids = <String>{};
    void validateTicket(Record t) {
      unique(ids, t['id'], 'ticket.id');
      for (final key in [
        'svc',
        'requester',
        'avatar',
        'title',
        'body',
        'hint',
      ]) {
        string(t[key], 'ticket.$key');
      }
      if (!['todo', 'done'].contains(t['status']) ||
          !['new', 'bug', 'change'].contains(t['type']) ||
          !['high', 'med', 'low'].contains(t['prio'])) {
        fail('ticket type');
      }
      number(t['reward'], 'reward', min: 0);
      number(t['xp'], 'xp', min: 0);
      integer(t['createdTick'] ?? 0, 'createdTick');
      for (final k in ['dueTick', 'resolvedTick']) {
        if (t[k] != null) integer(t[k], k);
      }
      if (t['criteria'] is! List ||
          (t['criteria'] as List).isEmpty ||
          (t['criteria'] as List).length > 20) {
        fail('criteria');
      }
      for (final c in t['criteria']) {
        if (c is! Record ||
            ![
              'running',
              'replicas',
              'deployment',
              'ha',
              'node_tag',
              'latest',
              'stable',
              'probes',
              'spread',
            ].contains(c['kind'])) {
          fail('criterion');
        }
        string(c['svc'], 'criterion.svc');
        string(c['label'], 'criterion.label');
        if (c['n'] != null) integer(c['n'], 'criterion.n');
        if (c['tag'] != null && !hw.contains(c['tag'])) fail('criterion.tag');
      }
      t['paid'] ??= t['status'] == 'done';
      if (t['paid'] is! bool) fail('paid');
      t['createdTick'] ??= 0;
    }

    for (final t in tickets) {
      validateTicket(t);
    }
    final pending = list('pending', max: 4);
    for (final p in pending) {
      integer(p['atTick'], 'pending.atTick');
      if (p['ticket'] is! Record) fail('pending.ticket');
      validateTicket(p['ticket']);
    }
    final events = list('events', max: 256);
    for (final e in events) {
      string(e['id'], 'event.id');
      string(e['title'], 'event.title');
      if (!['sale', 'outage', 'traffic_dip'].contains(e['kind'])) {
        fail('event.kind');
      }
      integer(e['startTick'], 'event.start');
      integer(e['endTick'], 'event.end');
      if (e['mult'] != null) number(e['mult'], 'event.mult', min: 0, max: 100);
    }
    final log = list('log', max: 80);
    for (final e in log) {
      integer(e['id'], 'log.id');
      integer(e['tick'], 'log.tick');
      string(e['title'], 'log.title');
      string(e['msg'], 'log.msg');
      string(e['kind'], 'log.kind');
    }
    if (s['outcome'] != null) {
      if (s['outcome'] is! Record ||
          !['won', 'lost'].contains(s['outcome']['kind'])) {
        fail('outcome');
      }
      string(s['outcome']['reason'], 'outcome.reason');
      integer(s['outcome']['atTick'], 'outcome.tick');
    }
    for (final k in [
      'nextProcTick',
      'budgetDebtTicks',
      'lastOutageTick',
      'lastBailoutDay',
    ]) {
      s[k] ??= fresh[k];
      integer(s[k], k);
    }
    if (s['endless'] is! bool) fail('endless');
    final purchases = list('upgrades', max: 32);
    for (final u in purchases) {
      if (u['owned'] is! bool) fail('upgrade.owned');
    }
    final merged = {
      ...fresh,
      ...s,
      'repos': fresh['repos'],
      'upgrades': records(fresh['upgrades'])
          .map(
            (u) => {
              ...u,
              'owned':
                  find(purchases, (p) => p['id'] == u['id'])?['owned'] == true,
            },
          )
          .toList(),
      'clock': {...s['clock'] as Record, 'paused': true},
      'stats': {...fresh['stats'] as Record, ...s['stats'] as Record},
      'ui': fresh['ui'],
      'flash': fresh['flash'],
      'toasts': <Record>[],
      'toastStamp': <String, dynamic>{},
      'form': fresh['form'],
      'firstBeat': null,
      'version': 1,
    };
    return merged;
  }
}
