import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'config/firebase_options.dart';
import 'config/nexora_themes.dart';
import 'services/appearance_controller.dart';
import 'services/auth_service.dart';
import 'screens/onboarding_screen.dart';
import 'screens/main_nav.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Load saved appearance settings (dark mode, gradient, animations,
  // text size) before the first frame so the app never briefly shows the
  // wrong theme. Failures fall back to safe defaults inside load().
  await AppearanceController.instance.load();

  runApp(const NexoraApp());
}

class NexoraApp extends StatefulWidget {
  const NexoraApp({super.key});

  @override
  State<NexoraApp> createState() => _NexoraAppState();
}

class _NexoraAppState extends State<NexoraApp> {
  @override
  void initState() {
    super.initState();
    // Rebuild the whole app when appearance settings change so the new
    // theme/gradient/animations/text size apply immediately everywhere.
    AppearanceController.instance.addListener(_onAppearanceChanged);
  }

  @override
  void dispose() {
    AppearanceController.instance.removeListener(_onAppearanceChanged);
    super.dispose();
  }

  void _onAppearanceChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final appearance = AppearanceController.instance;

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Nexora',
      theme: NexoraThemes.light,
      darkTheme: NexoraThemes.dark,
      themeMode: appearance.themeMode,
      // Apply Reduce Animations and Text Size app-wide via MediaQuery.
      builder: (context, child) {
        var data = MediaQuery.of(context);

        if (appearance.reduceAnimations) {
          data = data.copyWith(disableAnimations: true);
        }

        final scale = appearance.textScaleFactor;
        if (scale != 1.0) {
          data = data.copyWith(textScaler: TextScaler.linear(scale));
        }

        return MediaQuery(data: data, child: child!);
      },
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    // Wait for splash display
    await Future.delayed(const Duration(seconds: 2));

    if (!mounted) return;

    final authService = AuthService();

    // Attempt to restore session
    final userProfile = await authService.restoreSession();

    if (!mounted) return;

    if (userProfile != null && await authService.isSignedIn) {
      // User has a valid session → go to main app
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const MainNavigation()),
      );
    } else {
      // No valid session → show onboarding
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => const OnboardingScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(28),
                gradient: const LinearGradient(
                  colors: [Color(0xFF2563EB), Color(0xFF7C3AED)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              child: const Center(
                child: Text(
                  'N',
                  style: TextStyle(
                    fontSize: 64,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),

            const SizedBox(height: 24),

            Text(
              'Nexora',
              style: TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.bold,
                color: context.nexora.textPrimary,
              ),
            ),

            const SizedBox(height: 8),

            Text(
              'Connect. Share. Verify.',
              style: TextStyle(fontSize: 15, color: context.nexora.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}
