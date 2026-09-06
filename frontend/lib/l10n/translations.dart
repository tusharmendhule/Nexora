import 'package:flutter/widgets.dart';

import '../services/language_controller.dart';
import 'translations_bn.dart';
import 'translations_de.dart';
import 'translations_hi.dart';
import 'translations_it.dart';
import 'translations_pa.dart';
import 'translations_pt.dart';

/// Exposes the active [LanguageController] to the widget tree so any widget
/// that calls [tr] rebuilds automatically when the language changes.
///
/// [tr] registers an inherited dependency on this scope; when the controller
/// notifies, dependents are rebuilt with the new translations.
class LanguageScope extends InheritedNotifier<LanguageController> {
  const LanguageScope({
    super.key,
    required LanguageController controller,
    required super.child,
  }) : super(notifier: controller);

  static LanguageController? maybeOf(BuildContext context) {
    return context
        .dependOnInheritedWidgetOfExactType<LanguageScope>()
        ?.notifier;
  }
}

/// Per-locale translations. English is the source text and therefore needs no
/// table — any untranslated string simply falls back to English.
const Map<String, Map<String, String>> _translations = {
  'hi': hiTranslations,
  'bn': bnTranslations,
  'pa': paTranslations,
  'de': deTranslations,
  'it': itTranslations,
  'pt': ptTranslations,
};

/// Translates [text] (an English source string) into the active app
/// language. Returns English when the language is English or no translation
/// exists yet.
String tr(BuildContext context, String text) {
  final lang = LanguageScope.maybeOf(context)?.languageCode ?? 'en';
  if (lang == 'en' || text.isEmpty) return text;
  return _translations[lang]?[text] ?? text;
}

/// Translates a template that contains {0}, {1}… placeholders.
/// Example: trP(context, 'Hello {0}!', [name]).
String trP(BuildContext context, String template, List<String> args) {
  var result = tr(context, template);
  for (var i = 0; i < args.length; i++) {
    result = result.replaceAll('{$i}', args[i]);
  }
  return result;
}
