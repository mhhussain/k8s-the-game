import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:audioplayers/audioplayers.dart';

import 'engine/game.dart';
import 'engine/save.dart';

abstract class SaveStorage {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FileStorage implements SaveStorage {
  final Directory directory;
  FileStorage(this.directory);
  File file(String key) => File('${directory.path}/$key.json');
  @override
  Future<String?> read(String key) async {
    final f = file(key);
    return await f.exists() ? f.readAsString() : null;
  }

  @override
  Future<void> write(String key, String value) async {
    await directory.create(recursive: true);
    final temp = File('${file(key).path}.tmp');
    await temp.writeAsString(value, flush: true);
    await temp.rename(file(key).path);
  }

  @override
  Future<void> delete(String key) async {
    if (await file(key).exists()) await file(key).delete();
  }
}

class MemoryStorage implements SaveStorage {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    values.remove(key);
  }
}

class GameController extends ChangeNotifier with WidgetsBindingObserver {
  Game game;
  final SaveStorage storage;
  final bool effects;
  Record preferences = {
    'theme': 'daylight',
    'sound': true,
    'haptics': true,
    'tutorial': true,
    'tutorialStep': 0,
  };
  String? storageError;
  Timer? _timer;
  AudioPlayer? _player;
  bool _active = true, _disposed = false;
  int _holds = 0, _lifecycle = 0;
  Future<void> _writes = Future.value();
  GameController(this.storage, {Game? initial, this.effects = true})
    : game = initial ?? Game();
  static Future<GameController> open() async {
    final path = await getApplicationDocumentsDirectory();
    final c = GameController(FileStorage(Directory('${path.path}/k8sgame')));
    await c.initialize();
    return c;
  }

  Future<void> initialize() async {
    WidgetsBinding.instance.addObserver(this);
    try {
      final raw = await storage.read('auto');
      if (raw != null) game = Game.fromState(SaveCodec.decode(raw));
      final prefs = await storage.read('settings');
      if (prefs != null) {
        final p = jsonDecode(prefs);
        if (p is Record) preferences.addAll(p);
      }
      if (![
        'daylight',
        'bubblegum',
        'voltage',
      ].contains(preferences['theme'])) {
        preferences['theme'] = 'daylight';
      }
      for (final k in ['sound', 'haptics', 'tutorial']) {
        if (preferences[k] is! bool) preferences[k] = true;
      }
      if (preferences['tutorialStep'] is! int) preferences['tutorialStep'] = 0;
    } catch (e) {
      storageError = 'Your previous save could not be read. It has not been overwritten. Use Saves to import a backup or start a new game.';
    }
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    if (_disposed || !_active || _holds > 0 || game.paused || game.ended) {
      return;
    }
    _timer = Timer.periodic(
      Duration(milliseconds: (2200 / game.state['clock']['speed']).round()),
      (_) {
        dispatch('TICK');
        game.buildTick();
        _tutorialProgress();
        notifyListeners();
        if (game.tick % 12 == 0) unawaited(save());
      },
    );
  }

  void dispatch(String action, [Record args = const {}]) {
    final before = records(game.state['log']).lastOrNull?['id'];
    game.dispatch(action, args);
    _tutorialProgress();
    final latest = records(game.state['log']).lastOrNull;
    if (latest != null && latest['id'] != before) unawaited(_feedback(latest));
    _schedule();
    notifyListeners();
    if (action != 'TICK' &&
        action != 'BUILD_TICK' &&
        action != 'FORM_SET' &&
        action != 'FORM_PLACE') {
      unawaited(save());
    }
  }

  void _tutorialProgress() {
    if (preferences['tutorial'] != true) return;
    var step = preferences['tutorialStep'] as int;
    if (game.tickets.any((t) => t['id'] == 'TCK-101') && step < 1) step = 1;
    if (game.images.any((i) => i['repoId'] == 'repo-1') && step < 2) step = 2;
    if (game.images.any(
          (i) => i['repoId'] == 'repo-1' && i['building'] == false,
        ) &&
        step < 3) {
      step = 3;
    }
    if (game.service('web-storefront') != null && step < 4) step = 4;
    if (game.tickets.any(
      (t) => t['id'] == 'TCK-101' && t['status'] == 'done',
    )) {
      step = 5;
    }
    if (step != preferences['tutorialStep']) {
      preferences['tutorialStep'] = step;
      unawaited(savePreferences());
    }
  }

  Future<void> _feedback(Record event) async {
    if (!effects || !_active) return;
    try {
      if (preferences['haptics'] == true && event['kind'] == 'ok') {
        await HapticFeedback.lightImpact();
      }
      if (preferences['sound'] != true) return;
      final title = event['title'] as String;
      final file = title == 'Image built'
          ? 'build'
          : title == 'Upgrade unlocked'
          ? 'upgrade'
          : title == 'Ticket resolved'
          ? 'reward'
          : title == 'New incident' || title == 'Node outage'
          ? 'incident'
          : null;
      if (file == null) return;
      _player ??= AudioPlayer();
      await _player!.setAudioContext(
        AudioContextConfig(
          respectSilence: true,
          focus: AudioContextConfigFocus.mixWithOthers,
        ).build(),
      );
      await _player!.play(AssetSource('audio/$file.wav'), volume: 0.22);
    } catch (_) {
      /* Audio must never interrupt the simulation or saving. */
    }
  }

  Future<void> _write(String key, String value) {
    final operation = _writes.then((_) => storage.write(key, value));
    _writes = operation.catchError((Object e) {
      storageError = 'Could not save progress. Free device storage, then retry or export your save.';
      if (!_disposed) notifyListeners();
    });
    return operation;
  }

  Future<void> save([String slot = 'auto']) async {
    // A corrupt startup file remains available until an explicit recovery choice.
    if (storageError != null && slot == 'auto') return;
    try {
      await _write(slot, game.exportSave(slot));
    } catch (_) {
      /* surfaced through storageError */
    }
  }

  Future<void> retrySave() async {
    storageError = null;
    await save();
    notifyListeners();
  }

  Future<void> savePreferences() async {
    try {
      await _write('settings', jsonEncode(preferences));
    } catch (_) {}
  }

  void setting(String key, dynamic value) {
    preferences[key] = value;
    unawaited(savePreferences());
    notifyListeners();
  }

  Future<void> load(String text) async {
    final candidate = SaveCodec.decode(text);
    game = Game.fromState(candidate);
    storageError = null;
    _lifecycle++;
    _schedule();
    await save();
    notifyListeners();
  }

  Future<void> newGame() async {
    game = Game();
    storageError = null;
    _lifecycle++;
    preferences['tutorialStep'] = 0;
    _schedule();
    await save();
    await savePreferences();
    notifyListeners();
  }

  /// Token prevents modal closure from resuming after backgrounding or loading.
  Future<T?> holding<T>(Future<T?> Function() body) async {
    final resume = !game.paused;
    final generation = _lifecycle;
    _holds++;
    game.state['clock']['paused'] = true;
    _schedule();
    notifyListeners();
    try {
      return await body();
    } finally {
      _holds--;
      if (resume && generation == _lifecycle && _active && !game.ended) {
        game.state['clock']['paused'] = false;
      }
      _schedule();
      if (!_disposed) notifyListeners();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _active = state == AppLifecycleState.resumed;
    if (!_active) {
      _lifecycle++;
      game.state['clock']['paused'] = true;
      _timer?.cancel();
      unawaited(_player?.stop() ?? Future.value());
      unawaited(save());
    }
    _schedule();
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    unawaited(_player?.dispose() ?? Future.value());
    super.dispose();
  }
}
