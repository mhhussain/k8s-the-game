// Run explicitly: flutter test tool/capture_store_test.dart --update-goldens
// These are actual Flutter screen renders, not mocked marketing UI.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:k8sthegame/controller.dart';
import 'package:k8sthegame/engine/game.dart' hide find;
import 'package:k8sthegame/ui/app.dart';

Future<void> png(ui.Image image, String path) async {
  final data = await image.toByteData(format: ui.ImageByteFormat.png);
  final f = File(path);
  await f.parent.create(recursive: true);
  await f.writeAsBytes(data!.buffer.asUint8List());
  image.dispose();
}

void logo(Canvas canvas, double size, {bool background = true}) {
  if (background) {
    canvas.drawRect(Rect.fromLTWH(0, 0, size, size), Paint()..color = blue);
  }
  canvas.save();
  canvas.translate(size * .19, size * .19);
  canvas.scale(size * .62 / 24);
  final path = Path()
    ..moveTo(12, 2.2)
    ..lineTo(20.5, 7.1)
    ..lineTo(20.5, 16.9)
    ..lineTo(12, 21.8)
    ..lineTo(3.5, 16.9)
    ..lineTo(3.5, 7.1)
    ..close();
  canvas.drawPath(
    path,
    Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.9
      ..strokeJoin = StrokeJoin.round,
  );
  final paint = Paint()..color = Colors.white;
  canvas.drawCircle(const Offset(12, 12), 2.3, paint);
  for (final p in [
    const Offset(12, 6.6),
    const Offset(16.7, 14.7),
    const Offset(7.3, 14.7),
  ]) {
    canvas.drawCircle(p, 1.35, paint);
  }
  canvas.restore();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('GameSans');
    for (final file in ['Roboto-Regular.ttf', 'Roboto-Bold.ttf']) {
      font.addFont(
        Future.value(
          ByteData.sublistView(await File('assets/fonts/$file').readAsBytes()),
        ),
      );
    }
    await font.load();
    final icons = FontLoader('MaterialIcons')
      ..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));
    await icons.load();
  });
  testWidgets('capture actual phone and tablet gameplay', (tester) async {
    for (final target in <(String, Size, double)>[
      ('iphone-6.9', const Size(440, 956), 3),
      ('iphone-6.5', const Size(428, 926), 3),
      ('iphone-6.3', const Size(402, 874), 3),
      ('ipad-13', const Size(1032, 1376), 2),
      ('android-phone', const Size(360, 800), 3),
      ('android-tablet', const Size(800, 1280), 2),
    ]) {
      tester.view.physicalSize = Size(
        target.$2.width * target.$3,
        target.$2.height * target.$3,
      );
      tester.view.devicePixelRatio = target.$3;
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
      g.dispatch('TICKET_RESOLVE', {'id': 'TCK-101'});
      g.dispatch('BUY_UPGRADE', {'id': 'u-wl1'});
      g.dispatch('BUY_UPGRADE', {'id': 'u-ob1'});
      g.dispatch('PROVISION_NODE', {'kind': 'generic'});
      g.dispatch('FORM_EDIT', {'id': g.services.first['id']});
      g.dispatch('FORM_SET', {
        'patch': {'type': 'Deployment', 'liveness': true, 'readiness': true},
      });
      g.dispatch('SERVICE_SAVE');
      for (var i = 0; i < 33; i++) {
        g.advance();
      }
      g.state['clock']['paused'] = true;
      final c = GameController(MemoryStorage(), initial: g, effects: false);
      await c.initialize();
      c.preferences['tutorial'] = false;
      final boundary = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: boundary,
          child: GameApp(controller: c, showTitle: false),
        ),
      );
      await tester.pumpAndSettle();
      for (final screen in ['Tickets', 'Cluster', 'Build', 'Upgrades']) {
        await tester.tap(find.text(screen).last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.runAsync(() async {
          final render =
              boundary.currentContext!.findRenderObject()
                  as RenderRepaintBoundary;
          await png(
            await render.toImage(pixelRatio: target.$3),
            'store/screenshots/${target.$1}/${screen.toLowerCase()}.png',
          );
        });
      }
      await tester.pumpWidget(const SizedBox.shrink());
      c.dispose();
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  testWidgets('generate original logo assets and feature graphic', (
    tester,
  ) async {
    await tester.runAsync(() async {
      final ios = Directory('ios/Runner/Assets.xcassets/AppIcon.appiconset');
      final manifest = jsonDecode(
        await File('${ios.path}/Contents.json').readAsString(),
      );
      final sizes = <String, int>{
        'store/artwork/app-icon-1024.png': 1024,
        'store/artwork/google-play-icon-512.png': 512,
      };
      for (final item in manifest['images']) {
        if (item['filename'] == null) continue;
        final logical = double.parse((item['size'] as String).split('x').first);
        final scale = double.parse(
          (item['scale'] as String).replaceAll('x', ''),
        );
        sizes['${ios.path}/${item['filename']}'] = (logical * scale).round();
      }
      for (final e in {
        'mdpi': 48,
        'hdpi': 72,
        'xhdpi': 96,
        'xxhdpi': 144,
        'xxxhdpi': 192,
      }.entries) {
        sizes['android/app/src/main/res/mipmap-${e.key}/ic_launcher.png'] =
            e.value;
      }
      for (final e in sizes.entries) {
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        logo(canvas, e.value.toDouble());
        await png(
          await recorder.endRecording().toImage(e.value, e.value),
          e.key,
        );
      }
      for (final scale in [1, 2, 3]) {
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        logo(canvas, 96.0 * scale);
        await png(
          await recorder.endRecording().toImage(96 * scale, 96 * scale),
          'ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage${scale == 1 ? '' : '@${scale}x'}.png',
        );
      }
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      canvas.drawRect(
        const Rect.fromLTWH(0, 0, 1024, 500),
        Paint()..color = const Color(0xfff8f6f1),
      );
      canvas.save();
      canvas.translate(64, 64);
      logo(canvas, 96);
      canvas.restore();
      void text(
        String value,
        double x,
        double y,
        double size,
        Color color, {
        double width = 900,
      }) {
        final p = TextPainter(
          text: TextSpan(
            text: value,
            style: TextStyle(
              fontFamily: 'GameSans',
              fontSize: size,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: width);
        p.paint(canvas, Offset(x, y));
      }

      text('Kubernetes:', 64, 190, 66, ink);
      text('The Game', 64, 268, 58, blue);
      text('Tickets in. Uptime out.', 66, 368, 28, ink);
      text('OFFLINE  ·  NO ADS  ·  ONE COMPLETE GAME', 66, 432, 17, ink);
      for (var row = 0; row < 3; row++) {
        for (var col = 0; col < 2; col++) {
          final x = 720.0 + col * 128, y = 72.0 + row * 120;
          canvas.drawRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTWH(x, y, 104, 96),
              const Radius.circular(18),
            ),
            Paint()..color = Colors.white,
          );
          canvas.drawCircle(Offset(x + 80, y + 20), 5, Paint()..color = green);
          for (var p = 0; p < 3; p++) {
            canvas.drawRRect(
              RRect.fromRectAndRadius(
                Rect.fromLTWH(x + 14 + p * 25, y + 46, 18, 18),
                const Radius.circular(4),
              ),
              Paint()..color = blue,
            );
          }
        }
      }
      await png(
        await recorder.endRecording().toImage(1024, 500),
        'store/artwork/google-play-feature-1024x500.png',
      );
    });
  });
}
