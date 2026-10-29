import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/add_email_screen.dart';
import '../screens/auth/change_password_screen.dart';
import '../screens/auth/forgot_password_screen.dart';
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
    initialLocation: '/login',
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

      final isAuthRoute =
          location == '/login' || location == '/forgot-password';
      if (status == AuthStatus.unauthenticated) {
        return isAuthRoute ? null : '/login';
      }

      if (status == AuthStatus.authenticated && isAuthRoute) {
        return '/home';
      }

      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
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
        path: '/house/:id',
        pageBuilder: (context, state) => CustomTransitionPage(
          key: state.pageKey,
          child: HouseDetailScreen(houseId: state.pathParameters['id']!),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(
              opacity: CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              ),
              child: SlideTransition(
                position:
                    Tween<Offset>(
                      begin: const Offset(0.04, 0),
                      end: Offset.zero,
                    ).animate(
                      CurvedAnimation(
                        parent: animation,
                        curve: Curves.easeOutCubic,
                      ),
                    ),
                child: child,
              ),
            );
          },
        ),
      ),
      GoRoute(
        path: '/houses/:id',
        builder: (context, state) {
          final houseId = state.pathParameters['id']!;
          return HouseDetailScreen(houseId: houseId);
        },
      ),
      GoRoute(
        path: '/client/consent',
        builder: (context, state) => const ConsentScreen(houseId: 'house_0'),
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
