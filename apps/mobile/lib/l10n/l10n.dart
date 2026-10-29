import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/providers/api_client_provider.dart';
import 'package:mobile/providers/auth_provider.dart';
import 'package:mobile/providers/database_provider.dart';
import 'app_translations.dart';

/// State provider for active UI language (en, si, ta)
final languageProvider = StateProvider<String>((ref) => 'en');

/// Typed localization accessor backed by the loaded ARB translations.
class GrsL10n {
  final Locale locale;
  final Map<String, String> _localizedStrings;

  GrsL10n(this.locale, this._localizedStrings);

  static final Map<String, Map<String, String>> _cache = {};

  static void setCache(String lang, Map<String, String> strings) {
    _cache[lang] = strings;
  }

  static Future<GrsL10n> load(Locale locale) async {
    final lang = ['en', 'si', 'ta'].contains(locale.languageCode)
        ? locale.languageCode
        : 'en';

    if (_cache.containsKey(lang)) {
      return GrsL10n(locale, _cache[lang]!);
    }

    final strings = AppTranslations.get(lang);
    _cache[lang] = strings;
    return GrsL10n(locale, strings);
  }

  String translate(String key, [Map<String, String>? params]) {
    var str =
        _localizedStrings[key] ??
        AppTranslations.get(locale.languageCode)[key] ??
        AppTranslations.en[key] ??
        key;
    if (params != null) {
      params.forEach((paramKey, paramVal) {
        str = str.replaceAll('{$paramKey}', paramVal);
      });
    }
    return str;
  }

  String get(String key) => translate(key);

  static GrsL10n of(BuildContext context) {
    return Localizations.of<GrsL10n>(context, GrsL10n) ??
        GrsL10n(const Locale('en'), AppTranslations.en);
  }
}

class GrsLocalizationsDelegate extends LocalizationsDelegate<GrsL10n> {
  const GrsLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      ['en', 'si', 'ta'].contains(locale.languageCode);

  @override
  Future<GrsL10n> load(Locale locale) => GrsL10n.load(locale);

  @override
  bool shouldReload(GrsLocalizationsDelegate old) => false;
}

/// Trilingual language switcher button or dropdown
class LanguagePickerWidget extends ConsumerWidget {
  const LanguagePickerWidget({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentLang = ref.watch(languageProvider);

    return PopupMenuButton<String>(
      initialValue: currentLang,
      icon: const Icon(Icons.language_rounded),
      tooltip: 'Select Language / භාෂාව / மொழி',
      onSelected: (String lang) async {
        ref.read(languageProvider.notifier).state = lang;
        try {
          final storage = ref.read(secureStorageProvider);
          await storage.savePreferredLanguage(lang);

          final authState = ref.read(authProvider);
          if (authState.status == AuthStatus.authenticated) {
            await ref
                .read(apiClientProvider)
                .updateProfile(preferredLanguage: lang);
          }
        } catch (_) {}
      },
      itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
        const PopupMenuItem<String>(value: 'en', child: Text('English')),
        const PopupMenuItem<String>(
          value: 'si',
          child: Text('සිංහල (Sinhala)'),
        ),
        const PopupMenuItem<String>(value: 'ta', child: Text('தமிழ் (Tamil)')),
      ],
    );
  }
}
