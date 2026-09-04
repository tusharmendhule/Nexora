import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import 'onboarding_screen_2.dart';

class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              SizedBox(height: 60),

              // Illustration placeholder
              Container(
                height: 280,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: context.nexora.card,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Center(
                  child: Icon(
                    Icons.people_alt_outlined,
                    size: 100,
                    color: context.nexora.textSecondary,
                  ),
                ),
              ),

              SizedBox(height: 45),

              Text(
                'Share Your Moments',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                ),
              ),

              SizedBox(height: 16),

              Text(
                'Connect with people, share your moments, '
                'and express yourself freely.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),

              const Spacer(),

              // Page indicators
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _dot(context, true),
                  _dot(context, false),
                  _dot(context, false),
                ],
              ),

              SizedBox(height: 30),

              // Next button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: () {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (context) => const OnboardingScreen2(),
    ),
  );
},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF6C63FF),
                    foregroundColor: context.nexora.textPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    'Next',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),

              SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  static Widget _dot(BuildContext context, bool active) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      height: 8,
      width: active ? 24 : 8,
      decoration: BoxDecoration(
        color: active ? const Color(0xFF6C63FF) : context.nexora.textHint,
        borderRadius: BorderRadius.circular(10),
      ),
    );
  }
}