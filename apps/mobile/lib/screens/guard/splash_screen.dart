import 'package:flutter/material.dart';
import 'package:grs_ui/grs_ui.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: Image.asset(
                'assets/images/app_logo.png',
                width: 96,
                height: 96,
                errorBuilder: (_, _, _) => const Icon(
                  Icons.assignment_ind_outlined,
                  size: 80,
                  color: GrsColors.primaryLight,
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Global Research & Survey',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: GrsColors.textPrimaryLight,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 32),
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(
                strokeWidth: 3,
                color: GrsColors.primaryLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
