part of 'app.dart';

const glossary = <String, String>{
  'Cluster': 'The collection of machines running your applications. You manage prod-east-1 entirely through these menus.',
  'Node': 'One machine in the cluster. Normal nodes have 4 pod slots, Large nodes 8, and Specialized nodes 16. Hardware tags identify what can run there.',
  'Repository': 'The source-code project for an application. Tap Build image to package it into a runnable image.',
  'Image / Registry': 'An image is a versioned application package. The registry holds your builds. Building a newer image does not automatically update a service until Rolling Updates is unlocked.',
  'Pod': 'A running application copy. Bare Pods stay dead after a crash until restarted. Each replica costs \$60/day and can serve about 55 requests/second.',
  'Deployment': 'A workload controller that recreates crashed pods and re-homes them during node outages when space exists. Unlock it in Upgrades.',
  'Replica': 'One copy of a service. More replicas increase capacity and cost. Spread them across nodes so one outage does not stop everything.',
  'High availability (HA)': 'In this simulation: a Deployment with at least two replicas on at least two different nodes. This is a simplified model, not a production Kubernetes configuration guide.',
  'Liveness / Readiness': 'Liveness helps recover crashes. Readiness prevents half-started pods from serving traffic. Both unlock with Service Dashboard.',
  'Affinity': 'A service’s hardware requirement. A pod on a node without the required tag can be scheduled but cannot become healthy. Tag nodes or change placement.',
  'SLA / SLO': 'SLA measures service reliability. Completed ticket criteria remain standing requirements (SLOs). Breaking them can generate an unpaid regression incident.',
  'Budget / XP': 'Healthy traffic earns money; nodes and replicas cost money each game day. Tickets and healthy service days earn XP. Upgrades spend both.',
  'Soft deadline': 'Overdue requests lose 25% of their original reward per game day, down to a 50% floor. They remain completable. Reopening a paid ticket never pays twice.',
  'Autoscaling': 'Adds Deployment replicas under load when budget and slots allow. Removes replicas after sustained low demand. The autoscaler can reach 10 replicas; manual configuration supports up to 8.',
  'Emergency funding': 'When your budget is negative, Finance can provide \$1,000 once per game day, costing up to 20 XP. Two days below −\$2,000 ends the campaign.',
  'Win / Endless': 'Unlock Secrets & Data Tier to complete the campaign. You may continue in endless mode after either winning or losing.',
  'Clock / Offline play': 'One tick is 30 game minutes, taking 2.2 seconds at 1× speed. Closing or backgrounding pauses time. There are no away-time rewards or penalties.',
};
const privacyText = '''Kubernetes: The Game — Privacy Policy
Effective date: October 26, 2026

Developer: Mohammed Hussain
Contact: moohh91@gmail.com

The mobile game works entirely offline. It has no accounts, advertising, analytics, tracking, developer-operated servers, or in-app purchases. The app does not automatically collect or send gameplay data or crash reports to the developer.

Saves and settings are stored on your device. You can export a save through the device’s share sheet or import a file you choose. Save files contain simulated game state, not account information. If you share a file, your chosen destination handles that copy under its own terms.

Apple or Google may include app data in operating-system backups according to your device settings. The game does not implement its own cloud sync. Platform purchase records, diagnostics, and backup services are handled by Apple or Google under their policies.

If you email support, the developer receives the address, message, and attachments you choose to send. These are used to answer your request and retained only as needed for support. Do not include sensitive information in attachments. You can request deletion of support correspondence by email.

You can delete local app data by uninstalling the app or clearing its storage. Exported files and OS backups must be deleted separately through the tools that manage them. Starting a new game replaces autosave; manual slots can be deleted individually.

The app does not knowingly collect personal information from children. It does not require personal information to play.

The online privacy/support pages are hosted by GitHub Pages. Visiting those pages is separate from offline gameplay; GitHub may process technical request information under its privacy statement. No analytics are added to those pages by this game.

Changes to this policy will be published with an updated effective date. Contact moohh91@gmail.com with privacy or support questions.''';

extension _UtilityScreens on _GameShellState {
  Widget moreScreen() => scroll([
    heading(
      'Off the clock',
      'Your desk drawer',
      'Settings, saves, and a little operational wisdom.',
    ),
    for (final item in <(IconData, String, VoidCallback)>[
      (Icons.tune, 'Settings', openSettings),
      (Icons.save_outlined, 'Saves & transfers', openSaves),
      (Icons.menu_book_outlined, 'Field guide', openHelp),
      (Icons.history, 'Activity log', openLog),
      (
        Icons.bar_chart,
        'Shift report',
        () => utility('Shift report', (_) => stats()),
      ),
      (Icons.privacy_tip_outlined, 'Privacy & support', openPrivacy),
    ])
      Card(
        child: ListTile(
          minVerticalPadding: 16,
          leading: Icon(item.$1),
          title: Text(item.$2),
          trailing: const Icon(Icons.chevron_right),
          onTap: item.$3,
        ),
      ),
    if (g.budget < 0)
      panel(
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Finance has a lifeline.',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            const Text('Once per game day: +\$1,000, up to −20 XP.'),
            FilledButton.tonal(
              onPressed: g.state['lastBailoutDay'] == g.day
                  ? null
                  : () => act('BAILOUT'),
              child: const Text('Request emergency funding'),
            ),
          ],
        ),
      ),
    const SizedBox(height: 20),
    const Text(
      'Kubernetes: The Game · 1.0.0\nMade by Mohammed Hussain\nOffline. One purchase. Your whole cluster.',
      style: TextStyle(fontSize: 12, color: Color(0xff6b6459)),
    ),
  ]);
  void openSettings() {
    utility(
      'Settings',
      (ctx) => scroll([
        heading(
          'Make yourself comfortable',
          'Your shift preferences',
          'These settings stay on this device.',
        ),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: c.preferences['theme'],
          decoration: const InputDecoration(labelText: 'Theme'),
          items: [
            for (final t in ['daylight', 'bubblegum', 'voltage'])
              DropdownMenuItem(
                value: t,
                child: Text('${t[0].toUpperCase()}${t.substring(1)}'),
              ),
          ],
          onChanged: (v) => c.setting('theme', v),
        ),
        const SizedBox(height: 18),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Sound effects'),
          subtitle: const Text('Subtle cues; respects device silent settings.'),
          value: c.preferences['sound'] == true,
          onChanged: (v) => c.setting('sound', v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Haptic feedback'),
          value: c.preferences['haptics'] == true,
          onChanged: (v) => c.setting('haptics', v),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Pause on new requests'),
          subtitle: const Text('New requests and regressions pause time.'),
          value: g.state['settings']['pauseOnTicket'],
          onChanged: (v) => act('SET_PAUSE_ON_TICKET', {'on': v}),
        ),
        const SizedBox(height: 18),
        Text(
          'Incident frequency: ${(g.state['settings']['drama'] * 100).round()}%',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const Text(
          'Adjusts incident and crash risk. Costs and rewards stay the same.',
        ),
        Slider(
          value: (g.state['settings']['drama'] as num).toDouble(),
          min: 0,
          max: 1,
          divisions: 10,
          label: '${(g.state['settings']['drama'] * 100).round()}%',
          onChanged: (v) => act('SET_DRAMA', {'drama': v}),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('First-shift guidance'),
          subtitle: const Text(
            'Show contextual steps through your first ticket.',
          ),
          value: c.preferences['tutorial'] == true,
          onChanged: (v) => c.setting('tutorial', v),
        ),
        const Divider(height: 32),
        const Text(
          'Accessibility',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        const Text(
          'Text size and reduced-motion preferences follow your device settings. Statuses include words and icons as well as color. All gameplay actions are available by tapping.',
        ),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: () async {
            if (await confirm(
              'Start a new game?',
              'Autosave is replaced. Manual slots remain intact.',
              label: 'New game',
            )) {
              await c.newGame();
              if (ctx.mounted) {
                Navigator.pop(ctx);
                update(() => page = 0);
              }
            }
          },
          child: const Text('Start a new game'),
        ),
      ]),
    );
  }

  void openHelp() {
    utility(
      'Field guide',
      (_) => scroll([
        heading(
          'No terminal required',
          'A pocket guide to production',
          'You do not need Kubernetes experience to play.',
        ),
        panel(
          const Text(
            'Read a ticket → build an image → deploy a service → grow the cluster → mark the ticket done → buy automation.\n\nUse Resume to advance time. You can pause whenever you need to think.',
          ),
        ),
        for (final entry in glossary.entries)
          Card(
            child: ExpansionTile(
              title: Text(entry.key),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
              expandedCrossAxisAlignment: CrossAxisAlignment.start,
              children: [Text(entry.value)],
            ),
          ),
        TextButton(
          onPressed: () => c.setting('tutorial', true),
          child: const Text('Show first-shift guidance'),
        ),
      ]),
    );
  }

  void openLog() {
    utility(
      'Activity log',
      (_) => scroll([
        heading(
          'The paper trail',
          'What just happened',
          'The most recent 80 events, stored only on your device.',
        ),
        if ((g.state['log'] as List).isEmpty)
          const Text('Nothing to report yet.'),
        for (final e in records(g.state['log']).reversed)
          panel(
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Day ${(e['tick'] as int) ~/ 48 + 1} · ${e['title']}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                Text(e['msg']),
              ],
            ),
          ),
      ]),
    );
  }

  Widget stats() => scroll([
    heading(
      'Shift report',
      'Your production story',
      'A local record of this run.',
    ),
    for (final entry in <String, String>{
      'ticketsResolved': 'Requests resolved',
      'incidentsResolved': 'Incidents resolved',
      'incidentsRaised': 'Incidents raised',
      'imagesBuilt': 'Images built',
      'nodesProvisioned': 'Nodes provisioned',
      'peakServices': 'Peak services',
      'outagesSurvived': 'Outages survived',
      'outagesFelt': 'Outages felt',
      'bailouts': 'Emergency funding requests',
      'revenueEarned': 'Traffic revenue',
      'moneyEarned': 'Ticket revenue',
      'moneySpent': 'Infrastructure & upgrades',
      'worstSla': 'Lowest SLA',
    }.entries)
      panel(
        Row(
          children: [
            Expanded(child: Text(entry.value)),
            Text(
              entry.key.toLowerCase().contains('revenue') ||
                      entry.key.startsWith('money')
                  ? money(g.state['stats'][entry.key])
                  : entry.key == 'worstSla'
                  ? '${(g.state['stats'][entry.key] as num).toStringAsFixed(1)}%'
                  : '${g.state['stats'][entry.key]}',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ],
        ),
      ),
  ]);
  void openPrivacy() {
    utility(
      'Privacy & support',
      (_) => scroll([
        SelectableText(privacyText),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: () {
            Clipboard.setData(const ClipboardData(text: 'moohh91@gmail.com'));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Support email copied.')),
            );
          },
          icon: const Icon(Icons.copy),
          label: const Text('Copy support email'),
        ),
        const SizedBox(height: 12),
        const SelectableText(
          'https://mhhussain.github.io/k8s-the-game/privacy.html',
        ),
        const SizedBox(height: 20),
        const Text(
          'Kubernetes® is a trademark of The Linux Foundation. This independent game is not affiliated with or endorsed by the Kubernetes project.',
        ),
        TextButton(
          onPressed: () => showLicensePage(
            context: context,
            applicationName: 'Kubernetes: The Game',
            applicationVersion: '1.0.0',
            applicationLegalese: '© 2026 Mohammed Hussain',
          ),
          child: const Text('Open-source licenses'),
        ),
      ]),
    );
  }

  void openSaves() {
    utility(
      'Saves & transfers',
      (ctx) => SavePanel(controller: c, confirm: confirm),
    );
  }
}

class SavePanel extends StatefulWidget {
  final GameController controller;
  final Future<bool> Function(String, String, {String label}) confirm;
  const SavePanel({super.key, required this.controller, required this.confirm});
  @override
  State<SavePanel> createState() => _SavePanelState();
}

class _SavePanelState extends State<SavePanel> {
  GameController get c => widget.controller;
  final slots = <String, String?>{};
  bool busy = false;
  @override
  void initState() {
    super.initState();
    refresh();
  }

  Future<void> refresh() async {
    for (final key in ['auto', 'slot1', 'slot2', 'slot3']) {
      slots[key] = await c.storage.read(key);
    }
    if (mounted) setState(() {});
  }

  void notice(String message) {
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> perform(Future<void> Function() operation) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await operation();
      await refresh();
    } catch (e) {
      notice(
        e is FormatException ? e.message : 'The file operation failed. Your current game has not been replaced.',
      );
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> export() async {
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        files: [
          XFile.fromData(
            Uint8List.fromList(utf8.encode(c.game.exportSave())),
            mimeType: 'application/json',
          ),
        ],
        fileNameOverrides: ['kubernetes-the-game-day${c.game.day}.json'],
        subject: 'Kubernetes: The Game save',
        sharePositionOrigin: box == null
            ? null
            : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  }

  Future<void> import() async {
    final file = await openFile(
      acceptedTypeGroups: [
        const XTypeGroup(
          label: 'Game save',
          extensions: ['json'],
          uniformTypeIdentifiers: ['public.json'],
        ),
      ],
    );
    if (file == null) return;
    if (await file.length() > SaveCodec.maxBytes) {
      throw const FormatException('Save is larger than 2 MB.');
    }
    final text = await file.readAsString();
    final candidate = SaveCodec.decode(text);
    if (!mounted) return;
    if (await widget.confirm(
      'Import this save?',
      'Day ${(candidate['clock']['tick'] as int) ~/ 48 + 1}, ${money(candidate['meters']['budget'])}. This replaces current progress and autosave. Manual slots remain.',
      label: 'Import',
    )) {
      await c.load(text);
      notice('Save imported. Time is paused.');
    }
  }

  String describe(String? raw) {
    if (raw == null) return 'Empty';
    try {
      final f = jsonDecode(raw);
      return '${f['label']} · Day ${(f['state']['clock']['tick'] as int) ~/ 48 + 1} · ${money(f['state']['meters']['budget'])}';
    } catch (_) {
      return 'Unreadable save · import a backup to recover';
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(18),
    children: [
      Text(
        'Your cluster, safely filed.',
        style: Theme.of(context).textTheme.headlineMedium,
      ),
      const SizedBox(height: 8),
      const Text(
        'Autosaved every 12 ticks, after actions, and when leaving the app. Files can be transferred manually between mobile and the web game.',
      ),
      const SizedBox(height: 20),
      for (final key in ['auto', 'slot1', 'slot2', 'slot3'])
        Card(
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  key == 'auto'
                      ? 'Autosave'
                      : 'Manual slot ${key.substring(4)}',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                Text(describe(slots[key])),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    if (key != 'auto')
                      TextButton(
                        onPressed: busy
                            ? null
                            : () => perform(() async {
                                if (slots[key] == null ||
                                    await widget.confirm(
                                      'Overwrite this slot?',
                                      'The previous save in this slot will be replaced.',
                                      label: 'Save',
                                    )) {
                                  await c.save(key);
                                  if (c.storageError != null) {
                                    throw StateError('write failed');
                                  }
                                  notice('Slot saved.');
                                }
                              }),
                        child: const Text('Save here'),
                      ),
                    TextButton(
                      onPressed: busy || slots[key] == null
                          ? null
                          : () => perform(() async {
                              if (await widget.confirm(
                                'Load this save?',
                                'Current progress and autosave will be replaced.',
                                label: 'Load',
                              )) {
                                await c.load(slots[key]!);
                                notice('Save loaded. Time is paused.');
                              }
                            }),
                      child: const Text('Load'),
                    ),
                    if (key != 'auto')
                      TextButton(
                        onPressed: busy || slots[key] == null
                            ? null
                            : () => perform(() async {
                                if (await widget.confirm(
                                  'Delete this slot?',
                                  'This only deletes the selected manual save.',
                                  label: 'Delete',
                                )) {
                                  await c.storage.delete(key);
                                }
                              }),
                        child: const Text('Delete'),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      const SizedBox(height: 12),
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          FilledButton.icon(
            onPressed: busy ? null : () => perform(export),
            icon: const Icon(Icons.ios_share),
            label: const Text('Export current game'),
          ),
          OutlinedButton.icon(
            onPressed: busy ? null : () => perform(import),
            icon: const Icon(Icons.file_open_outlined),
            label: const Text('Import JSON'),
          ),
        ],
      ),
      const SizedBox(height: 20),
      const Text(
        'No account or cloud sync. System backups depend on your device settings. Keep an exported copy before replacing your device or uninstalling.',
      ),
    ],
  );
}
