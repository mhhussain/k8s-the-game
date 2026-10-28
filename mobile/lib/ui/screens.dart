part of 'app.dart';

extension _PlayScreens on _GameShellState {
  Widget tutorial() {
    if (c.preferences['tutorial'] != true) return const SizedBox.shrink();
    final step = (c.preferences['tutorialStep'] as int).clamp(0, 5);
    const titles = [
      'Welcome to your first shift',
      '1. Read your first ticket',
      '2. Let the image build',
      '3. Deploy your storefront',
      '4. Watch it become healthy',
      'First ticket complete!',
    ];
    const hints = [
      'Tap Resume. Your first request arrives after three ticks. Time stops when it lands.',
      'Open “Get web-storefront live.” Then go to Build and tap Build image on web-storefront. An image packages your application.',
      'Resume time. A cold build takes five ticks. You can always pause to think.',
      'In Build, tap Deploy beside the completed storefront image. Keep two replicas and tap Deploy service. A replica is one running copy.',
      'Resume time for three ticks. When the service is Running, return to Tickets and tap Mark done.',
      'Your reward funds the next steps. Unlock Deployments, provision another node, and spread replicas to survive outages.',
    ];
    return panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.school_outlined, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  titles[step],
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
              IconButton(
                tooltip: 'Skip tutorial',
                onPressed: () => c.setting('tutorial', false),
                icon: const Icon(Icons.close, size: 20),
              ),
            ],
          ),
          Text(hints[step]),
          if (step == 5)
            TextButton(
              onPressed: () => c.setting('tutorial', false),
              child: const Text('I’ve got this'),
            ),
        ],
      ),
    );
  }

  Widget ticketsScreen() => LayoutBuilder(
    builder: (context, box) {
      final list = g.tickets
          .where((t) => t['status'] == ticketFilter)
          .toList()
          .reversed
          .toList();
      final chosen =
          find(g.tickets, (t) => t['id'] == selectedTicket) ?? list.firstOrNull;
      final left = scroll([
        heading(
          'Operations desk',
          'The ticket queue',
          'Real requests. Slightly unrealistic stakeholders.',
        ),
        tutorial(),
        Wrap(
          spacing: 8,
          children: [
            ChoiceChip(
              label: Text(
                'Open (${g.tickets.where((t) => t['status'] == 'todo').length})',
              ),
              selected: ticketFilter == 'todo',
              onSelected: (_) => update(() => ticketFilter = 'todo'),
            ),
            ChoiceChip(
              label: const Text('Resolved'),
              selected: ticketFilter == 'done',
              onSelected: (_) => update(() => ticketFilter = 'done'),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (list.isEmpty)
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.inbox_outlined, size: 36),
                const SizedBox(height: 12),
                Text(
                  ticketFilter == 'done'
                      ? 'Your wins will live here.'
                      : 'A quiet queue. For now.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  g.tick < 3
                      ? 'Resume the clock to meet your first stakeholder.'
                      : 'Keep services healthy. New requests arrive as time advances.',
                ),
              ],
            ),
          ),
        for (final t in list) ticketCard(t, box.maxWidth >= 850),
      ], key: const PageStorageKey('tickets'));
      return box.maxWidth >= 850
          ? Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(flex: 5, child: left),
                const VerticalDivider(width: 1),
                Expanded(
                  flex: 6,
                  child: chosen == null
                      ? const Center(
                          child: Text(
                            'Select a ticket to inspect its acceptance criteria.',
                          ),
                        )
                      : SingleChildScrollView(
                          padding: const EdgeInsets.all(24),
                          child: ticketDetail(chosen),
                        ),
                ),
              ],
            )
          : left;
    },
  );
  Widget ticketCard(Record t, bool wide) => Card(
    child: InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () {
        update(() => selectedTicket = t['id']);
        act('CLEAR_BEAT');
        if (!wide) {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (ctx) => ListenableBuilder(
                listenable: c,
                builder: (ctx, _) {
                  final current = find(g.tickets, (x) => x['id'] == t['id']);
                  return Scaffold(
                    appBar: AppBar(title: Text(t['id'])),
                    body: SafeArea(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.all(18),
                        child: current == null
                            ? const Text('Ticket no longer available.')
                            : ticketDetail(current),
                      ),
                    ),
                  );
                },
              ),
            ),
          );
        }
      },
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 10,
              runSpacing: 6,
              children: [
                Text(
                  t['id'],
                  style: const TextStyle(fontFamily: 'GameSans', fontSize: 12),
                ),
                badge(
                  t['type'] == 'bug' ? 'Incident' : 'Request',
                  t['type'] == 'bug'
                      ? Icons.warning_amber
                      : Icons.confirmation_number_outlined,
                ),
                Text(
                  '${t['prio']} priority',
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(t['title'], style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Text(
              t['requester'],
              style: const TextStyle(fontSize: 12, color: Color(0xff6b6459)),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 14,
              runSpacing: 6,
              children: [
                Text(
                  t['paid'] == true
                      ? 'Paid'
                      : '+${money(g.reward(t))} · ${t['xp']} XP',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: green,
                  ),
                ),
                Text(
                  '${records(t['criteria']).where(g.grade).length}/${records(t['criteria']).length} criteria met',
                  style: const TextStyle(fontSize: 12),
                ),
                if (t['dueTick'] != null && t['status'] == 'todo')
                  Text(
                    g.tick > t['dueTick']
                        ? 'Overdue · reduced reward'
                        : 'Due day ${(t['dueTick'] as int) ~/ 48 + 1}',
                    style: const TextStyle(fontSize: 12),
                  ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
  Widget ticketDetail(Record t) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      heading(t['requester'], t['title'], t['body']),
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'ACCEPTANCE CRITERIA',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1,
              ),
            ),
            const SizedBox(height: 12),
            for (final criterion in records(t['criteria']))
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      g.grade(criterion)
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      color: g.grade(criterion) ? green : Colors.grey,
                      size: 22,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(criterion['label']),
                          if (criterion['kind'] == 'ha')
                            const Text(
                              'Deployment · at least 2 replicas · at least 2 nodes',
                              style: TextStyle(
                                fontSize: 12,
                                color: Color(0xff6b6459),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            badge('Between the lines', Icons.lightbulb_outline),
            const SizedBox(height: 8),
            Text(
              (t['hint'] as String)
                  .replaceAll(
                    'drag the repo onto the Registry',
                    'tap Build image',
                  )
                  .replaceAll(
                    'Click the dashed + on a node card',
                    'Open a node’s hardware tags',
                  ),
            ),
          ],
        ),
      ),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          FilledButton.icon(
            onPressed: t['status'] == 'done'
                ? null
                : () => act('TICKET_RESOLVE', {'id': t['id']}),
            icon: const Icon(Icons.check),
            label: Text(g.met(t) ? 'Mark done' : 'Check criteria'),
          ),
          if (t['status'] == 'done')
            OutlinedButton(
              onPressed: () => act('TICKET_REOPEN', {'id': t['id']}),
              child: const Text('Reopen · no second payout'),
            ),
          OutlinedButton(
            onPressed: () {
              if (Navigator.of(context).canPop()) Navigator.of(context).pop();
              update(() => page = g.service(t['svc']) != null ? 1 : 2);
            },
            child: Text(
              g.service(t['svc']) != null
                  ? 'Open cluster'
                  : 'Open build pipeline',
            ),
          ),
        ],
      ),
      const SizedBox(height: 12),
      Text(
        t['paid'] == true
            ? 'This ticket has already paid its reward.'
            : 'Reward: ${money(g.reward(t))} · ${t['xp']} XP',
      ),
      if (t['status'] == 'todo' && !g.met(t))
        const Padding(
          padding: EdgeInsets.only(top: 8),
          child: Text('Complete every criterion before closing this ticket.'),
        ),
    ],
  );
  Widget clusterScreen() => scroll([
    heading(
      'Infrastructure',
      'Your cluster',
      'Keep it healthy. Give it room to grow.',
    ),
    Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        ChoiceChip(
          label: Text('Services (${g.services.length})'),
          selected: !showNodes,
          onSelected: (_) => update(() => showNodes = false),
        ),
        ChoiceChip(
          label: Text('Nodes (${g.nodes.length})'),
          selected: showNodes,
          onSelected: (_) => update(() => showNodes = true),
        ),
        OutlinedButton.icon(
          onPressed: provision,
          icon: const Icon(Icons.add),
          label: const Text('Add node'),
        ),
      ],
    ),
    const SizedBox(height: 16),
    panel(
      Wrap(
        spacing: 24,
        runSpacing: 12,
        children: [
          metric('TRAFFIC / DAY', money(g.revenue)),
          metric('UPKEEP / DAY', money(g.upkeep)),
          metric('FREE POD SLOTS', '${g.totalFree()}'),
        ],
      ),
    ),
    for (final e in records(
      g.state['events'],
    ).where((e) => e['endTick'] > g.tick))
      panel(
        Row(
          children: [
            const Icon(Icons.campaign_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                '${e['title']}\n${e['startTick'] > g.tick ? 'Starts in ${e['startTick'] - g.tick} ticks' : 'Active · ${e['endTick'] - g.tick} ticks left'}',
              ),
            ),
          ],
        ),
      ),
    if (showNodes)
      for (final n in g.nodes) nodeCard(n),
    if (!showNodes && g.services.isEmpty)
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.dns_outlined, size: 36),
            const SizedBox(height: 12),
            const Text('No services yet.'),
            const Text('Build an image, then deploy it here.'),
            TextButton(
              onPressed: () => update(() => page = 2),
              child: const Text('Open Build'),
            ),
          ],
        ),
      ),
    if (!showNodes)
      for (final s in g.services) serviceCard(s),
  ], key: const PageStorageKey('cluster'));
  Widget serviceCard(Record s) => panel(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            Text(s['name'], style: Theme.of(context).textTheme.titleMedium),
            status(s['status']),
          ],
        ),
        const SizedBox(height: 5),
        Text(
          '${s['type']} · image v${g.version(s)} · ${s['ready'][0]}/${s['replicas']} ready',
          style: const TextStyle(fontSize: 12),
        ),
        const SizedBox(height: 16),
        Wrap(
          spacing: 24,
          runSpacing: 12,
          children: [
            metric('REPLICAS', '${s['replicas']}'),
            metric('PLACEMENT', '${g.pods(s).toSet().length} nodes'),
            metric('UPKEEP', '${money(s['replicas'] * 60)}/day'),
          ],
        ),
        if (g.owns('dashboard')) ...[
          const Divider(height: 28),
          Wrap(
            spacing: 24,
            runSpacing: 12,
            children: [
              metric('DEMAND', '${g.demand(s).round()} req/s'),
              metric(
                'LOAD',
                '${s['replicas'] == 0 ? 0 : (g.demand(s) / (s['replicas'] * 55) * 100).round()}%',
              ),
              metric('ERRORS', '${(s['errorRate'] * 100).toStringAsFixed(1)}%'),
              metric('RESTARTS', '${s['restarts']}'),
            ],
          ),
          const SizedBox(height: 12),
          Semantics(
            label: 'Health ${s['health'].round()} percent',
            child: LinearProgressIndicator(
              value: clamp(s['health'] / 100, 0, 1).toDouble(),
              minHeight: 6,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
        ],
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            TextButton.icon(
              onPressed: () => editService(s: s),
              icon: const Icon(Icons.tune),
              label: const Text('Configure'),
            ),
            TextButton.icon(
              onPressed: () => act('SERVICE_RESTART', {'id': s['id']}),
              icon: const Icon(Icons.restart_alt),
              label: const Text('Restart'),
            ),
            TextButton(
              onPressed: () async {
                if (await confirm(
                  'Remove ${s['name']}?',
                  'Resolved tickets remain standing requirements. Removing this service may raise a regression.',
                  label: 'Remove service',
                )) {
                  act('SERVICE_DELETE', {'id': s['id']});
                }
              },
              child: const Text('Remove'),
            ),
          ],
        ),
      ],
    ),
  );
  Widget nodeCard(Record n) => panel(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 8,
          children: [
            Text(n['name'], style: Theme.of(context).textTheme.titleMedium),
            status(
              n['downFor'] > 0 ? 'Offline · ${n['downFor']} ticks' : 'Running',
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          '${n['tier']} · ${g.used(n['id'])}/${n['slots']} slots · ${money({'Normal': 120, 'Large': 190, 'Special': 320}[n['tier']]!)}/day',
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (var i = 0; i < n['slots']; i++)
              Semantics(
                label:
                    'Slot ${i + 1}: ${i < g.used(n['id']) ? 'occupied' : 'free'}',
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: i < g.used(n['id'])
                        ? Theme.of(context).colorScheme.primary
                        : const Color(0xffeeebe3),
                    borderRadius: BorderRadius.circular(5),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          'Hardware tags',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
        ),
        Wrap(
          spacing: 8,
          children: [
            for (final tag in ['x86', 'ARM', 'GPU', 'DATA'])
              FilterChip(
                label: Text(tag),
                selected: (n['tags'] as List).contains(tag),
                onSelected: n['kind'] == 'special'
                    ? null
                    : (selected) => act(
                        selected ? 'NODE_ADD_TAG' : 'NODE_REMOVE_TAG',
                        {'id': n['id'], 'tag': tag},
                      ),
              ),
          ],
        ),
        TextButton(
          onPressed: () async {
            if (await confirm(
              'Decommission ${n['name']}?',
              'The node must be empty. You receive 50% of its provision cost.',
              label: 'Decommission',
            )) {
              act('DECOMMISSION_NODE', {'id': n['id']});
            }
          },
          child: const Text('Decommission'),
        ),
      ],
    ),
  );
  Future<void> provision() async {
    await utility(
      'Provision a node',
      (ctx) => scroll([
        heading(
          'Make room',
          'Choose your hardware',
          'Normal nodes are flexible. Specialized nodes have a fixed hardware tag.',
        ),
        for (final tier in ['Normal', 'Large', 'Special'])
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$tier node',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                Text(
                  '${{'Normal': 4, 'Large': 8, 'Special': 16}[tier]} slots · ${money({'Normal': 400, 'Large': 650, 'Special': 1150}[tier]!)} to provision',
                ),
                if (tier == 'Large' && !g.owns('large_nodes'))
                  const Text('Unlock Large Nodes in Upgrades.'),
                if (tier == 'Special' && !g.owns('special_nodes'))
                  const Text('Unlock Specialized Hardware in Upgrades.'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final hw
                        in tier == 'Special'
                            ? ['x86', 'ARM', 'GPU', 'DATA']
                            : ['generic'])
                      FilledButton.tonal(
                        onPressed:
                            (tier == 'Large' && !g.owns('large_nodes')) ||
                                (tier == 'Special' && !g.owns('special_nodes'))
                            ? null
                            : () {
                                final before = g.nodes.length;
                                act('PROVISION_NODE', {
                                  'kind': tier == 'Special'
                                      ? 'special'
                                      : 'generic',
                                  'tier': tier,
                                  'hw': hw,
                                });
                                if (g.nodes.length > before) Navigator.pop(ctx);
                              },
                        child: Text(
                          tier == 'Special'
                              ? 'Provision $hw'
                              : 'Provision $tier',
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
      ]),
    );
  }

  Widget buildScreen() => scroll([
    heading(
      'Supply chain',
      'From repo to running',
      'Build an image. Ship something useful.',
    ),
    tutorial(),
    if (g.owns('ci_autobuild'))
      panel(
        badge(
          'CI online · builds active repositories every 40 ticks',
          Icons.autorenew,
        ),
      ),
    for (final r in g.repos)
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.code),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        r['name'],
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      Text(r['lang'], style: const TextStyle(fontSize: 12)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(r['desc']),
            const SizedBox(height: 12),
            for (final i
                in g.images
                    .where((i) => i['repoId'] == r['id'])
                    .toList()
                    .reversed
                    .take(3))
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        badge(
                          'v${i['version']} · ${i['building'] == true ? 'Building ${i['progress']}%' : 'Ready'}',
                          Icons.inventory_2_outlined,
                        ),
                        if (i['building'] != true)
                          TextButton(
                            onPressed: () => editService(
                              s: g.service(r['name']),
                              imageId: i['id'],
                            ),
                            child: Text(
                              g.service(r['name']) == null
                                  ? 'Deploy'
                                  : 'Update service',
                            ),
                          ),
                      ],
                    ),
                    if (i['building'] == true)
                      LinearProgressIndicator(
                        value: i['progress'] / 100,
                        semanticsLabel: 'Image build progress',
                        semanticsValue: '${i['progress']} percent',
                      ),
                  ],
                ),
              ),
            OutlinedButton.icon(
              onPressed:
                  g.images.any(
                    (i) => i['repoId'] == r['id'] && i['building'] == true,
                  )
                  ? null
                  : () => act('BUILD_IMAGE', {'repoId': r['id']}),
              icon: const Icon(Icons.play_arrow),
              label: const Text('Build image'),
            ),
          ],
        ),
      ),
  ], key: const PageStorageKey('build'));
  Widget upgradesScreen() => scroll([
    heading(
      'SKILL TREE',
      'Build your automation',
      'Follow the paths, then spend budget and XP to unlock each skill.',
    ),
    panel(
      Row(
        children: [
          const Icon(Icons.auto_awesome, color: green),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              '${g.upgrades.where((u) => u['owned'] == true).length} / ${g.upgrades.length} online · ${g.xp.round()} XP · ${money(g.budget)}',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ],
      ),
    ),
    const Text(
      'Tap a skill for details. Swipe sideways to explore the branches.',
    ),
    const SizedBox(height: 16),
    skillTree(),
    const SizedBox(height: 12),
    const Text(
      'Secrets & Data Tier completes the campaign. Continue afterward in endless mode.',
    ),
  ], key: const PageStorageKey('upgrades'));

  Widget upgradeDetails(Record u) => panel(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              u['owned'] == true
                  ? Icons.check_circle
                  : Icons.account_tree_outlined,
              color: u['owned'] == true
                  ? green
                  : Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                u['name'],
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          (u['desc'] as String).replaceAll(
            'Stop dragging.',
            'Build automatically.',
          ),
        ),
        if ((u['requires'] as List).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Text(
              'Requires: ${(u['requires'] as List).map((id) => find(g.upgrades, (x) => x['id'] == id)?['name'] ?? id).join(', ')}',
              style: const TextStyle(fontSize: 12),
            ),
          ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              '${money(u['cost'])} · ${u['xp']} XP',
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            FilledButton.tonal(
              onPressed: g.affordable(u)
                  ? () => act('BUY_UPGRADE', {'id': u['id']})
                  : null,
              child: Text(u['owned'] == true ? 'Online' : 'Unlock'),
            ),
          ],
        ),
      ],
    ),
  );

  Widget skillTree() {
    const branches = ['Build', 'Workload', 'Observability', 'Infra', 'Scaling'];
    final depths = <String, int>{};
    int depth(Record u) => depths[u['id']] ??= (u['requires'] as List).isEmpty
        ? 0
        : 1 +
              (u['requires'] as List)
                  .map((id) => depth(find(g.upgrades, (x) => x['id'] == id)!))
                  .reduce((a, b) => a > b ? a : b);
    final positions = <String, Offset>{};
    for (final u in g.upgrades) {
      positions[u['id']] = Offset(
        branches.indexOf(u['branch']) * 224.0 + 8,
        depth(u) * 200.0 + 52,
      );
    }
    final height =
        (depths.values.reduce((a, b) => a > b ? a : b) + 1) * 200.0 + 52;
    return SingleChildScrollView(
      key: const PageStorageKey('skill-tree-horizontal'),
      scrollDirection: Axis.horizontal,
      child: SizedBox(
        width: 1120,
        height: height,
        child: Stack(
          children: [
            Positioned.fill(
              child: CustomPaint(
                painter: _SkillPaths(
                  positions,
                  g.upgrades,
                  Theme.of(context).colorScheme.primary,
                ),
              ),
            ),
            for (var i = 0; i < branches.length; i++)
              Positioned(
                left: i * 224.0 + 8,
                top: 8,
                width: 208,
                child: Text(
                  branches[i].toUpperCase(),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                  ),
                ),
              ),
            for (final u in g.upgrades)
              Positioned(
                left: positions[u['id']]!.dx,
                top: positions[u['id']]!.dy,
                width: 208,
                height: 156,
                child: skillNode(u),
              ),
          ],
        ),
      ),
    );
  }

  Widget skillNode(Record u) {
    final owned = u['owned'] == true;
    final ready = g.affordable(u);
    final color = owned
        ? green
        : ready
        ? Theme.of(context).colorScheme.primary
        : Colors.blueGrey;
    return Semantics(
      button: true,
      label:
          '${u['name']}, ${owned
              ? 'online'
              : ready
              ? 'available'
              : 'locked'}',
      child: Material(
        color: owned ? const Color(0xffedf8ef) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: color, width: ready || owned ? 2 : 1),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => utility(u['name'], (_) => scroll([upgradeDetails(u)])),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      owned
                          ? Icons.check_circle
                          : ready
                          ? Icons.bolt
                          : Icons.lock_outline,
                      color: color,
                      size: 20,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      owned
                          ? 'ONLINE'
                          : ready
                          ? 'AVAILABLE'
                          : 'LOCKED',
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: Text(
                    u['name'],
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Text(
                  owned
                      ? 'Skill acquired'
                      : '${money(u['cost'])} · ${u['xp']} XP',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> editService({Record? s, String? imageId}) async {
    act(
      s == null ? 'FORM_NEW' : 'FORM_EDIT',
      s == null ? {'imageId': imageId} : {'id': s['id']},
    );
    if (s != null && imageId != null) {
      act('FORM_SET', {
        'patch': {'imageId': imageId},
      });
    }
    await utility(s == null ? 'Deploy a service' : 'Configure ${s['name']}', (
      ctx,
    ) {
      final d = g.state['form']['draft'] as Record?;
      if (d == null) return const SizedBox.shrink();
      final current = g.image(d['imageId']);
      final available = g.images
          .where(
            (i) =>
                i['building'] != true &&
                (s == null || i['repoId'] == current?['repoId']),
          )
          .toList();
      void patch(Record p) => act('FORM_SET', {'patch': p});
      return scroll([
        heading(
          'Service configuration',
          d['name'].isEmpty ? 'Your next service' : d['name'],
          'Time is paused while you configure this service.',
        ),
        DropdownButtonFormField<String>(
          initialValue: available.any((i) => i['id'] == d['imageId'])
              ? d['imageId']
              : null,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Container image'),
          items: [
            for (final i in available)
              DropdownMenuItem(
                value: i['id'],
                child: Text(i['tag'], overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (v) => patch({'imageId': v}),
        ),
        const SizedBox(height: 16),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: d['type'],
          decoration: const InputDecoration(labelText: 'Workload'),
          items: [
            const DropdownMenuItem(
              value: 'Pod',
              child: Text('Pod · manual recovery'),
            ),
            if (g.owns('deployments'))
              const DropdownMenuItem(
                value: 'Deployment',
                child: Text('Deployment · recreates pods'),
              ),
          ],
          onChanged: (v) => patch({'type': v}),
        ),
        if (!g.owns('deployments'))
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Unlock Deployments to recover crashed pods automatically.',
            ),
          ),
        const SizedBox(height: 16),
        panel(
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Replicas: ${d['replicas']}',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const Text(
                'Each copy serves up to 55 requests/second and costs \$60/day.',
              ),
              Row(
                children: [
                  IconButton(
                    tooltip: 'Remove replica',
                    onPressed: d['replicas'] > 0
                        ? () => patch({'replicas': d['replicas'] - 1})
                        : null,
                    icon: const Icon(Icons.remove_circle_outline),
                  ),
                  Expanded(
                    child: Slider(
                      value: (d['replicas'] as num).clamp(0, 8).toDouble(),
                      min: 0,
                      max: 8,
                      divisions: 8,
                      label: '${d['replicas']}',
                      onChanged: (v) => patch({'replicas': v.round()}),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Add replica',
                    onPressed: d['replicas'] < 8
                        ? () => patch({'replicas': d['replicas'] + 1})
                        : null,
                    icon: const Icon(Icons.add_circle_outline),
                  ),
                ],
              ),
            ],
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Liveness probe'),
          subtitle: Text(
            g.owns('dashboard')
                ? 'Faster crash recovery and lower crash risk.'
                : 'Unlock Service Dashboard first.',
          ),
          value: d['liveness'],
          onChanged: g.owns('dashboard') ? (v) => patch({'liveness': v}) : null,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Readiness probe'),
          subtitle: const Text(
            'Keeps starting pods away from incoming traffic.',
          ),
          value: d['readiness'],
          onChanged: g.owns('dashboard')
              ? (v) => patch({'readiness': v})
              : null,
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: d['affinity'] ?? 'Any',
          decoration: const InputDecoration(labelText: 'Required hardware'),
          items: [
            for (final tag in ['Any', 'x86', 'ARM', 'GPU', 'DATA'])
              DropdownMenuItem(value: tag, child: Text(tag)),
          ],
          onChanged: g.owns('affinity')
              ? (v) => patch({'affinity': v == 'Any' ? null : v})
              : null,
        ),
        const SizedBox(height: 8),
        const Text(
          'A pod on incompatible hardware schedules but stays unhealthy.',
          style: TextStyle(fontSize: 12),
        ),
        const SizedBox(height: 20),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Auto-spread replicas'),
          subtitle: const Text('Spread across nodes for high availability.'),
          value: d['spread'] == 'auto',
          onChanged: (v) => patch({'spread': v ? 'auto' : 'manual'}),
        ),
        for (final n in g.nodes)
          panel(
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        n['name'],
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      Text(
                        '${(n['tags'] as List).join(' / ')} · ${g.free(s?['id'])[n['id']]} free slots',
                        style: const TextStyle(fontSize: 12),
                      ),
                    ],
                  ),
                ),
                if (d['spread'] == 'manual')
                  IconButton(
                    tooltip: 'Remove replica from ${n['name']}',
                    onPressed: () =>
                        act('FORM_PLACE', {'nodeId': n['id'], 'delta': -1}),
                    icon: const Icon(Icons.remove),
                  ),
                Text(
                  '${(d['podNodes'] as List).where((id) => id == n['id']).length}',
                ),
                if (d['spread'] == 'manual')
                  IconButton(
                    tooltip: 'Place replica on ${n['name']}',
                    onPressed: () =>
                        act('FORM_PLACE', {'nodeId': n['id'], 'delta': 1}),
                    icon: const Icon(Icons.add),
                  ),
              ],
            ),
          ),
        if (d['spread'] == 'manual')
          Text(
            'Placed ${(d['podNodes'] as List).length} of ${d['replicas']} replicas',
          ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () {
            act('SERVICE_SAVE');
            if (g.state['form']['open'] != true) {
              update(() => page = 1);
              Navigator.pop(ctx);
            } else {
              final last = records(g.state['log']).lastOrNull;
              if (last != null) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  SnackBar(content: Text('${last['title']}: ${last['msg']}')),
                );
              }
            }
          },
          icon: const Icon(Icons.rocket_launch_outlined),
          label: Text(s == null ? 'Deploy service' : 'Apply changes'),
        ),
        const SizedBox(height: 18),
      ]);
    });
    act('FORM_CLOSE');
  }
}

class _SkillPaths extends CustomPainter {
  final Map<String, Offset> positions;
  final List<Record> upgrades;
  final Color accent;
  _SkillPaths(this.positions, this.upgrades, this.accent);
  @override
  void paint(Canvas canvas, Size size) {
    for (final u in upgrades) {
      for (final id in u['requires'] as List) {
        final start = positions[id]! + const Offset(104, 156);
        final end = positions[u['id']]! + const Offset(104, 0);
        final online = find(upgrades, (x) => x['id'] == id)?['owned'] == true;
        final path = Path()
          ..moveTo(start.dx, start.dy)
          ..cubicTo(
            start.dx,
            start.dy + 22,
            end.dx,
            end.dy - 22,
            end.dx,
            end.dy,
          );
        canvas.drawPath(
          path,
          Paint()
            ..color = online ? accent : const Color(0xffc8cfd6)
            ..strokeWidth = online ? 3 : 2
            ..style = PaintingStyle.stroke,
        );
        canvas.drawCircle(
          end,
          4,
          Paint()..color = online ? accent : const Color(0xffc8cfd6),
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _SkillPaths oldDelegate) => true;
}
