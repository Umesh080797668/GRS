import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import 'l10n/l10n.dart';
import 'providers/api_client_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/database_provider.dart';
import 'router/app_router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: GrsMobileApp()));
}

class GrsMobileApp extends ConsumerStatefulWidget {
  const GrsMobileApp({super.key});

  @override
  ConsumerState<GrsMobileApp> createState() => _GrsMobileAppState();
}

class _GrsMobileAppState extends ConsumerState<GrsMobileApp> {
  @override
  void initState() {
    super.initState();
    // Cold Start session check & saved server URL restore (M2.6)
    Future.microtask(() async {
      final storage = ref.read(secureStorageProvider);
      final savedUrl = await storage.getApiBaseUrl();
      if (savedUrl != null &&
          savedUrl.trim().isNotEmpty &&
          !savedUrl.contains('localhost') &&
          !savedUrl.contains('127.0.0.1')) {
        ref.read(apiBaseUrlProvider.notifier).state = savedUrl.trim();
      } else {
        if (savedUrl != null &&
            (savedUrl.contains('localhost') ||
                savedUrl.contains('127.0.0.1'))) {
          await storage.saveApiBaseUrl('');
        }
        ref.read(apiBaseUrlProvider.notifier).state =
            ApiEndpointResolver.resolveDefault();
      }
      ref.read(authProvider.notifier).checkColdStart();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final currentLang = ref.watch(languageProvider);

    return MaterialApp.router(
      title: 'GRS Mobile',
      debugShowCheckedModeBanner: false,
      routerConfig: router,
      locale: Locale(currentLang),
      supportedLocales: const [Locale('en'), Locale('si'), Locale('ta')],
      localizationsDelegates: const [
        GrsLocalizationsDelegate(),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: GrsTheme.lightTheme(languageCode: currentLang),
      darkTheme: GrsTheme.darkTheme(languageCode: currentLang),
      themeMode: ThemeMode.system,
    );
  }
}
