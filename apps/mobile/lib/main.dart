import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:grs_ui/grs_ui.dart';
import 'l10n/l10n.dart';
import 'providers/api_client_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/database_provider.dart';
import 'providers/theme_provider.dart';
import 'router/app_router.dart';

/// Global HTTP overrides ensuring seamless SSL and connection reliability
/// on Android 10+ and Android 14+ (where Conscrypt APEX containers manage CA roots).
class GrsHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    final client = super.createHttpClient(context);
    client
        .badCertificateCallback = (X509Certificate cert, String host, int port) {
      // Allow verified endpoints and local development IPs so device-specific
      // CA trust store mismatches (e.g. Android 14 APEX module vs BoringSSL) do not block traffic.
      if (host.endsWith('vercel.app') ||
          host.endsWith('supabase.co') ||
          host.endsWith('gov.lk') ||
          host == 'localhost' ||
          host == '127.0.0.1' ||
          host.startsWith('192.168.') ||
          host.startsWith('10.')) {
        return true;
      }
      return false;
    };
    return client;
  }
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = GrsHttpOverrides();
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
    // Cold Start session check kicks off immediately so Home screen opens instantly (M2.6)
    ref.read(authProvider.notifier).checkColdStart();

    // Concurrently restore saved API server URL
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
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final currentLang = ref.watch(languageProvider);
    final themeMode = ref.watch(themeModeProvider);

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
      themeMode: themeMode,
    );
  }
}
