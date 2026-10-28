import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/add_email_screen.dart';
import '../screens/auth/change_password_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/client/client_form_screen.dart';
import '../screens/client/consent_screen.dart';
import '../screens/guard/deactivated_screen.dart';
import '../screens/guard/version_gate_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/house/house_detail_screen.dart';
import '../screens/records/my_records_screen.dart';
import '../screens/settings/settings_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/home',
    redirect: (context, state) {
      final status = authState.status;
      final location = state.matchedLocation;

      if (status == AuthStatus.initial) {
        return null;
      }

      if (status == AuthStatus.versionGate) {
        return location == '/version-gate' ? null : '/version-gate';
      }

      if (status == AuthStatus.deactivated) {
        return location == '/deactivated' ? null : '/deactivated';
      }

      if (status == AuthStatus.mustChangePassword) {
        return location == '/change-password' ? null : '/change-password';
      }

      if (status == AuthStatus.addEmailOptional) {
        return location == '/add-email' ? null : '/add-email';
      }

      final isLoggingIn = location == '/login';
      if (status == AuthStatus.unauthenticated) {
        return isLoggingIn ? null : '/login';
      }

      if (status == AuthStatus.authenticated && isLoggingIn) {
        return '/home';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/change-password',
        builder: (context, state) => const ChangePasswordScreen(),
      ),
      GoRoute(
        path: '/add-email',
        builder: (context, state) => const AddEmailScreen(),
      ),
      GoRoute(
        path: '/deactivated',
        builder: (context, state) => const DeactivatedScreen(),
      ),
      GoRoute(
        path: '/version-gate',
        builder: (context, state) => const VersionGateScreen(),
      ),
      GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
      GoRoute(
        path: '/houses/:id',
        builder: (context, state) {
          final houseId = state.pathParameters['id']!;
          return HouseDetailScreen(houseId: houseId);
        },
      ),
      GoRoute(
        path: '/houses/:id/consent',
        builder: (context, state) {
          final houseId = state.pathParameters['id']!;
          return ConsentScreen(houseId: houseId);
        },
      ),
      GoRoute(
        path: '/houses/:id/client/new',
        builder: (context, state) {
          final houseId = state.pathParameters['id']!;
          final consent = state.uri.queryParameters['consent'] == 'true';
          return ClientFormScreen(houseId: houseId, consentGiven: consent);
        },
      ),
      GoRoute(
        path: '/houses/:id/client/:clientId',
        builder: (context, state) {
          final houseId = state.pathParameters['id']!;
          final clientId = state.pathParameters['clientId']!;
          return ClientFormScreen(houseId: houseId, clientId: clientId);
        },
      ),
      GoRoute(
        path: '/my-records',
        builder: (context, state) => const MyRecordsScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
    ],
  );
});
