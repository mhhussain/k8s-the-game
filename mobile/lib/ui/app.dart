import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_selector/file_selector.dart';
import 'package:share_plus/share_plus.dart';

import '../controller.dart';
import '../engine/game.dart';
import '../engine/save.dart';
import '../l10n/app_localizations.dart';
part 'screens.dart';
part 'utilities.dart';

const ink = Color(0xff211e1a),
    blue = Color(0xff4c6ef5),
    green = Color(0xff168047);
String money(num n) =>
    '${n < 0 ? '−' : ''}\$${n.abs().round().toString().replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}';

class GameApp extends StatelessWidget {
  final GameController controller;
  final bool showTitle;
  const GameApp({super.key, required this.controller, this.showTitle = true});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final theme = controller.preferences['theme'];
      final accent = theme == 'bubblegum'
          ? const Color(0xff9954cc)
          : theme == 'voltage'
          ? const Color(0xff6d3bf5)
          : blue;
      final background = theme == 'bubblegum'
          ? const Color(0xfffcf5ff)
          : theme == 'voltage'
          ? const Color(0xfff4f6fb)
          : const Color(0xfff8f6f1);
      final scheme = ColorScheme.fromSeed(
        seedColor: accent,
        brightness: Brightness.light,
      ).copyWith(primary: accent, surface: background, onSurface: ink);
      return MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Kubernetes: The Game',
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        theme: ThemeData(
          fontFamily: 'GameSans',
          colorScheme: scheme,
          scaffoldBackgroundColor: background,
          useMaterial3: true,
          visualDensity: VisualDensity.standard,
          appBarTheme: AppBarTheme(
            backgroundColor: background,
            surfaceTintColor: Colors.transparent,
          ),
          cardTheme: CardThemeData(
            color: Colors.white,
            elevation: 0,
            margin: const EdgeInsets.only(bottom: 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: const BorderSide(color: Color(0xffe7e3db)),
            ),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            ),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
          ),
          inputDecorationTheme: InputDecorationTheme(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            filled: true,
            fillColor: Colors.white,
          ),
          textTheme: const TextTheme(
            headlineLarge: TextStyle(
              fontSize: 36,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.1,
            ),
            headlineMedium: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.7,
            ),
            titleLarge: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
            titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            bodyLarge: TextStyle(fontSize: 16, height: 1.5),
            bodyMedium: TextStyle(fontSize: 14, height: 1.45),
          ),
        ),
        home: GameShell(controller: controller, showTitle: showTitle),
      );
    },
  );
}

class Logo extends StatelessWidget {
  final double size;
  const Logo({super.key, this.size = 48});
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Kubernetes: The Game cluster logo',
    image: true,
    child: Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.primary,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      padding: EdgeInsets.all(size * 0.19),
      child: CustomPaint(painter: _LogoPainter()),
    ),
  );
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 24, size.height / 24);
    final p = Path()
      ..moveTo(12, 2.2)
      ..lineTo(20.5, 7.1)
      ..lineTo(20.5, 16.9)
      ..lineTo(12, 21.8)
      ..lineTo(3.5, 16.9)
      ..lineTo(3.5, 7.1)
      ..close();
    canvas.drawPath(
      p,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.9
        ..strokeJoin = StrokeJoin.round,
    );
    final fill = Paint()..color = Colors.white;
    canvas.drawCircle(const Offset(12, 12), 2.3, fill);
    for (final point in [
      const Offset(12, 6.6),
      const Offset(16.7, 14.7),
      const Offset(7.3, 14.7),
    ]) {
      canvas.drawCircle(point, 1.35, fill);
    }
  }

  @override
  bool shouldRepaint(_LogoPainter oldDelegate) => false;
}

class GameShell extends StatefulWidget {
  final GameController controller;
  final bool showTitle;
  const GameShell({super.key, required this.controller, this.showTitle = true});
  @override
  State<GameShell> createState() => _GameShellState();
}

class _GameShellState extends State<GameShell> {
  GameController get c => widget.controller;
  Game get g => c.game;
  late bool title = widget.showTitle;
  int page = 0;
  String? selectedTicket;
  String ticketFilter = 'todo';
  bool showNodes = false;
  dynamic _lastNotice;
  @override
  void initState() {
    super.initState();
    _lastNotice = records(g.state['log']).lastOrNull?['id'];
    c.addListener(_notice);
  }

  void _notice() {
    final last = records(g.state['log']).lastOrNull;
    if (last == null || last['id'] == _lastNotice) return;
    _lastNotice = last['id'];
    if (title) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final messenger = ScaffoldMessenger.of(context);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text("${last['title']}: ${last['msg']}"),
          duration: const Duration(seconds: 3),
          showCloseIcon: true,
        ),
      );
    });
  }

  @override
  void dispose() {
    c.removeListener(_notice);
    super.dispose();
  }

  void update(VoidCallback change) => setState(change);
  void act(String action, [Record args = const {}]) => c.dispatch(action, args);
  Future<void> utility(
    String title,
    Widget Function(BuildContext) content,
  ) async {
    await c.holding(
      () => Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (ctx) => ListenableBuilder(
            listenable: c,
            builder: (ctx, _) => Scaffold(
              appBar: AppBar(title: Text(title)),
              body: SafeArea(child: content(ctx)),
            ),
          ),
        ),
      ),
    );
  }

  Future<bool> confirm(
    String heading,
    String body, {
    String label = 'Confirm',
  }) async =>
      await c.holding(
        () => showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(heading),
            content: Text(body),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: Text(label),
              ),
            ],
          ),
        ),
      ) ??
      false;
  void start() {
    setState(() => title = false);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        if (title) return titleScreen();
        final labels = [l.tickets, l.cluster, l.build, l.upgrades, l.more];
        const icons = [
          Icons.confirmation_number_outlined,
          Icons.dns_outlined,
          Icons.inventory_2_outlined,
          Icons.account_tree_outlined,
          Icons.more_horiz,
        ];
        return LayoutBuilder(
          builder: (context, box) {
            final wide = box.maxWidth >= 800 && box.maxHeight >= 600;
            return Scaffold(
              appBar: AppBar(
                title: Row(
                  children: [
                    const Logo(size: 32),
                    const SizedBox(width: 10),
                    Flexible(
                      child: Text(
                        'prod-east-1',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                  ],
                ),
                actions: [
                  IconButton(
                    tooltip: 'Title screen',
                    onPressed: () {
                      act('PAUSE', {'paused': true});
                      setState(() => title = true);
                    },
                    icon: const Icon(Icons.home_outlined),
                  ),
                  IconButton(
                    tooltip: l.help,
                    onPressed: openHelp,
                    icon: const Icon(Icons.help_outline),
                  ),
                ],
              ),
              body: SafeArea(
                child: Column(
                  children: [
                    hud(),
                    if (c.storageError != null) errorBanner(),
                    Expanded(
                      child: g.ended
                          ? SingleChildScrollView(child: outcome())
                          : Row(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                if (wide)
                                  NavigationRail(
                                    selectedIndex: page,
                                    labelType: NavigationRailLabelType.all,
                                    onDestinationSelected: (v) =>
                                        setState(() => page = v),
                                    destinations: [
                                      for (var i = 0; i < labels.length; i++)
                                        NavigationRailDestination(
                                          icon: Icon(icons[i]),
                                          label: Text(labels[i]),
                                        ),
                                    ],
                                  ),
                                Expanded(
                                  child: IndexedStack(
                                    index: page,
                                    children: [
                                      ticketsScreen(),
                                      clusterScreen(),
                                      buildScreen(),
                                      upgradesScreen(),
                                      moreScreen(),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ],
                ),
              ),
              bottomNavigationBar: wide
                  ? null
                  : NavigationBar(
                      selectedIndex: page,
                      onDestinationSelected: (v) => setState(() => page = v),
                      destinations: [
                        for (var i = 0; i < labels.length; i++)
                          NavigationDestination(
                            icon: Icon(icons[i]),
                            label: labels[i],
                          ),
                      ],
                    ),
            );
          },
        );
      },
    );
  }

  Widget titleScreen() => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 680),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Logo(size: 80),
                const SizedBox(height: 28),
                Text(
                  'Kubernetes:',
                  style: Theme.of(context).textTheme.headlineLarge,
                ),
                Text(
                  'The Game',
                  style: Theme.of(context).textTheme.headlineLarge
                      ?.copyWith(color: Theme.of(context).colorScheme.primary),
                ),
                const SizedBox(height: 12),
                Text(
                  'Tickets in. Uptime out.',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                const Text(
                  'You are the new architect of prod-east-1. Build services, survive the incidents, and automate your way to a quiet afternoon.',
                ),
                const SizedBox(height: 24),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.icon(
                      onPressed: start,
                      icon: const Icon(Icons.play_arrow),
                      label: Text(
                        g.tick == 0
                            ? 'Start your shift'
                            : 'Continue · Day ${g.day}',
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () async {
                        if (await confirm(
                          'Start a new game?',
                          'This replaces autosave. Manual slots remain available.',
                          label: 'New game',
                        )) {
                          await c.newGame();
                          if (mounted) setState(() => title = false);
                        }
                      },
                      child: const Text('New game'),
                    ),
                    TextButton(
                      onPressed: openSaves,
                      child: const Text('Load a save'),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                panel(
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'YOUR SHIFT, YOUR PACE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.4,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: [
                          badge('100% offline', Icons.wifi_off),
                          badge(
                            'No ads or purchases',
                            Icons.check_circle_outline,
                          ),
                          badge('Pause anytime', Icons.pause_circle_outline),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'One complete game. Your cluster waits when you close the app.',
                      ),
                    ],
                  ),
                ),
                if (c.storageError != null) errorBanner(),
                TextButton(
                  onPressed: openHelp,
                  child: const Text('New to Kubernetes? Open the field guide'),
                ),
                const SizedBox(height: 20),
                const Text(
                  'An independent game by Mohammed Hussain.\nKubernetes® is a trademark of The Linux Foundation. Not affiliated with or endorsed by the Kubernetes project.',
                  style: TextStyle(fontSize: 12, color: Color(0xff6b6459)),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
  Widget hud() {
    final mins = g.state['clock']['mins'] as int;
    final stats = Wrap(
      alignment: WrapAlignment.center,
      spacing: 18,
      runSpacing: 8,
      children: [
        metric(
          'BUDGET',
          money(g.budget),
          color: g.budget < 0 ? Colors.red.shade700 : null,
        ),
        metric(
          'SLA',
          '${(g.state['meters']['sla'] as num).toStringAsFixed(1)}%',
        ),
        metric('XP', '${g.xp.round()}'),
        metric(
          'SHIFT',
          'Day ${g.day} · ${(mins ~/ 60).toString().padLeft(2, '0')}:${(mins % 60).toString().padLeft(2, '0')}',
        ),
      ],
    );
    final controls = Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 8,
      children: [
        FilledButton.tonalIcon(
          onPressed: g.ended
              ? null
              : () => g.paused
                    ? act('SPEED', {'speed': g.state['clock']['speed']})
                    : act('PAUSE', {'paused': true}),
          icon: Icon(g.paused ? Icons.play_arrow : Icons.pause),
          label: Text(g.paused ? 'Resume' : 'Pause'),
        ),
        PopupMenuButton<int>(
          tooltip: 'Simulation speed',
          enabled: !g.ended,
          onSelected: (speed) => act('SPEED', {'speed': speed}),
          itemBuilder: (_) => [
            for (final speed in [1, 2, 4])
              PopupMenuItem(value: speed, child: Text('$speed× speed')),
          ],
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Text(
              "${g.state['clock']['speed']}×",
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ),
        if (g.state['endless'] == true) const Chip(label: Text('Endless')),
      ],
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xffe7e3db))),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final tablet =
              constraints.maxWidth >= 740 &&
              MediaQuery.textScalerOf(context).scale(14) <= 18;
          return tablet
              ? Row(
                  key: const ValueKey('tablet-status-bar'),
                  children: [
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: stats,
                      ),
                    ),
                    const SizedBox(width: 16),
                    controls,
                  ],
                )
              : Column(children: [stats, const SizedBox(height: 8), controls]);
        },
      ),
    );
  }

  Widget errorBanner() => Padding(
    padding: const EdgeInsets.all(12),
    child: MaterialBanner(
      content: Text(c.storageError!),
      actions: [
        TextButton(onPressed: c.retrySave, child: const Text('Retry save')),
        TextButton(onPressed: openSaves, child: const Text('Backups')),
      ],
    ),
  );
  Widget outcome() => Padding(
    padding: const EdgeInsets.all(12),
    child: panel(
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            g.state['outcome']['kind'] == 'won'
                ? 'Your cluster runs itself.'
                : 'Finance pulled the plug.',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          Text(g.state['outcome']['reason']),
          Wrap(
            spacing: 12,
            children: [
              FilledButton(
                onPressed: () => act('CONTINUE_ENDLESS'),
                child: const Text('Continue in endless mode'),
              ),
              TextButton(
                onPressed: () => utility('Shift report', (_) => stats()),
                child: const Text('View shift report'),
              ),
            ],
          ),
        ],
      ),
    ),
  );
  Widget panel(Widget child, {EdgeInsets padding = const EdgeInsets.all(18)}) =>
      Card(
        child: Padding(padding: padding, child: child),
      );
  Widget badge(String text, IconData icon) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 17, color: Theme.of(context).colorScheme.primary),
      const SizedBox(width: 6),
      Flexible(
        child: Text(
          text,
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
    ],
  );
  Widget metric(String label, String value, {Color? color}) => Column(
    mainAxisSize: MainAxisSize.min,
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.1,
          color: Color(0xff6b6459),
        ),
      ),
      Text(
        value,
        style: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    ],
  );
  Widget heading(String eyebrow, String title, String subtitle) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.5,
            color: Theme.of(context).colorScheme.primary,
          ),
        ),
        const SizedBox(height: 5),
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 5),
        Text(subtitle, style: const TextStyle(color: Color(0xff6b6459))),
      ],
    ),
  );
  Widget scroll(List<Widget> children, {Key? key}) =>
      ListView(key: key, padding: const EdgeInsets.all(18), children: children);
  Widget status(String value) {
    final good = value == 'Running' || value == 'done';
    final bad = value == 'CrashLoopBackOff';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          good
              ? Icons.check_circle
              : bad
              ? Icons.error
              : Icons.circle_outlined,
          size: 16,
          color: good
              ? green
              : bad
              ? Colors.red.shade700
              : Colors.orange.shade800,
        ),
        const SizedBox(width: 5),
        Flexible(
          child: Text(
            value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
          ),
        ),
      ],
    );
  }
}
