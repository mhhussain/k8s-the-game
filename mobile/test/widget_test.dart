import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:k8sthegame/controller.dart';
import 'package:k8sthegame/ui/app.dart';

void main() {
  for (final size in [
    const Size(320, 568),
    const Size(375, 812),
    const Size(812, 375),
    const Size(1024, 1366),
    const Size(1366, 1024),
  ]) {
    testWidgets('navigation fits $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = GameController(MemoryStorage(), effects: false);
      await c.initialize();
      addTearDown(c.dispose);
      await tester.pumpWidget(GameApp(controller: c, showTitle: false));
      await tester.pumpAndSettle();
      for (final text in ['Cluster', 'Build', 'Upgrades', 'More', 'Tickets']) {
        await tester.tap(find.text(text).last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$text at $size');
      }
    });
  }
  testWidgets('tablet status controls share a row with stats', (tester) async {
    tester.view.physicalSize = const Size(1024, 1366);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = GameController(MemoryStorage(), effects: false);
    await c.initialize();
    addTearDown(c.dispose);
    await tester.pumpWidget(GameApp(controller: c, showTitle: false));
    expect(find.byKey(const ValueKey('tablet-status-bar')), findsOneWidget);
    final budget = tester.getCenter(find.text('BUDGET'));
    final resume = tester.getCenter(find.text('Resume'));
    expect((budget.dy - resume.dy).abs(), lessThan(30));
  });

  testWidgets('skill node opens details and purchases the existing upgrade', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1024, 1366);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = GameController(MemoryStorage(), effects: false);
    await c.initialize();
    addTearDown(c.dispose);
    c.game.state['meters']['budget'] = 100000;
    c.game.state['meters']['xp'] = 100000;
    final upgrade = c.game.upgrades.firstWhere(
      (u) => (u['requires'] as List).isEmpty,
    );
    final budget = c.game.budget;
    await tester.pumpWidget(GameApp(controller: c, showTitle: false));
    await tester.tap(find.text('Upgrades').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text(upgrade['name']).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(upgrade['owned'], true);
    expect(c.game.budget, budget - upgrade['cost']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('backgrounding pauses, saves, and never resumes on modal close', (
    tester,
  ) async {
    final storage = MemoryStorage();
    final c = GameController(storage, effects: false);
    await c.initialize();
    addTearDown(c.dispose);
    c.dispatch('SPEED', {'speed': 1});
    await c.holding(() async {
      c.didChangeAppLifecycleState(AppLifecycleState.inactive);
      c.didChangeAppLifecycleState(AppLifecycleState.resumed);
      return null;
    });
    await tester.pump();
    expect(c.game.paused, true);
    await c.save();
    expect(storage.values['auto'], isNotNull);
  });
  testWidgets('service form survives rotation and deploys', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = GameController(MemoryStorage(), effects: false);
    await c.initialize();
    addTearDown(c.dispose);
    c.dispatch('BUILD_IMAGE', {'repoId': 'repo-1'});
    for (var i = 0; i < 5; i++) {
      c.game.buildTick();
    }
    await tester.pumpWidget(GameApp(controller: c, showTitle: false));
    await tester.tap(find.text('Build').last);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Deploy').first,
      200,
      scrollable: find
          .descendant(
            of: find.byKey(const PageStorageKey('build')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await Scrollable.ensureVisible(
      tester.element(find.text('Deploy').first),
      alignment: 0.5,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Deploy').first);
    await tester.pumpAndSettle();
    expect(find.text('Replicas: 2'), findsOneWidget);
    tester.view.physicalSize = const Size(844, 390);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(c.game.state['form']['draft']['replicas'], 2);
  });
  testWidgets('large text stays usable on a narrow phone', (tester) async {
    tester.view.physicalSize = const Size(375, 812);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final c = GameController(MemoryStorage(), effects: false);
    await c.initialize();
    addTearDown(c.dispose);
    await tester.pumpWidget(GameApp(controller: c, showTitle: false));
    await tester.pumpAndSettle();
    for (final label in ['Cluster', 'Build', 'Upgrades', 'More']) {
      await tester.tap(find.text(label).last);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull, reason: label);
    }
  });
}
