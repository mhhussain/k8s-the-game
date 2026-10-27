// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Kubernetes: The Game';

  @override
  String get tagline => 'Tickets in. Uptime out.';

  @override
  String get tickets => 'Tickets';

  @override
  String get cluster => 'Cluster';

  @override
  String get build => 'Build';

  @override
  String get upgrades => 'Upgrades';

  @override
  String get more => 'More';

  @override
  String get resume => 'Resume';

  @override
  String get pause => 'Pause';

  @override
  String get newGame => 'New game';

  @override
  String get continueGame => 'Continue';

  @override
  String get settings => 'Settings';

  @override
  String get saves => 'Saves & transfers';

  @override
  String get help => 'Field guide';

  @override
  String get privacy => 'Privacy & support';
}
