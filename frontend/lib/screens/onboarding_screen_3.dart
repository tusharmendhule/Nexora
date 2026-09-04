import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import 'login_screen.dart';

class OnboardingScreen3 extends StatelessWidget {
  const OnboardingScreen3({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              const Spacer(),

              Container(
                width: 220,
                height: 220,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(30),
                  gradient: const LinearGradient(
                    colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
                  ),
                ),
                child: Center(
                  child: Icon(
                    Icons.verified_user_outlined,
                    color: context.nexora.textPrimary,
                    size: 90,
                  ),
                ),
              ),

              SizedBox(height: 45),

              Text(
                'Connect With Confidence',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 26,
                  fontWeight: FontWeight.w700,
                ),
              ),

              SizedBox(height: 14),

              Text(
                'A safer and smarter social experience '
                'designed with privacy in mind.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 16,
                  height: 1.5,
                ),
              ),

              const Spacer(),

              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [_dot(context, false), _dot(context, false), _dot(context, true)],
              ),

              SizedBox(height: 25),

              SizedBox(
                width: double.infinity,
                height: 54,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => const LoginScreen(),
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
                    'Get Started',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
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
