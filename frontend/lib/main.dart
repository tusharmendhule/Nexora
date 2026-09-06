import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:firebase_core/firebase_core.dart';
import 'config/api_config.dart';
import 'config/firebase_options.dart';
import 'config/nexora_themes.dart';
import 'services/appearance_controller.dart';
import 'services/auth_service.dart';
import 'services/language_controller.dart';
import 'l10n/translations.dart';
import 'screens/onboarding_screen.dart';
import 'screens/main_nav.dart';
import 'utils/route_observer.dart';

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

  // Load the saved backend server-address override (gear icon on the login
  // screen / Settings → Server Address) before anything makes a network
  // call, so a phone can reach the backend without a rebuild.
  await ApiConfig.loadServerHostOverride();

  // Load the saved app language before the first frame so the UI never
  // briefly flashes in the wrong language.
  await LanguageController.instance.load();

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
    // Rebuild the whole app when appearance or language changes so the new
    // theme/gradient/animations/text size/locale apply everywhere.
    AppearanceController.instance.addListener(_onAppSettingsChanged);
    LanguageController.instance.addListener(_onAppSettingsChanged);
  }

  @override
  void dispose() {
    AppearanceController.instance.removeListener(_onAppSettingsChanged);
    LanguageController.instance.removeListener(_onAppSettingsChanged);
    super.dispose();
  }

  void _onAppSettingsChanged() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final appearance = AppearanceController.instance;
    final language = LanguageController.instance;

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Nexora',
      navigatorObservers: [routeObserver],
      theme: NexoraThemes.light,
      darkTheme: NexoraThemes.dark,
      themeMode: appearance.themeMode,
      // App language
      locale: Locale(language.languageCode),
      supportedLocales: kSupportedLanguages.map((l) => Locale(l.code)),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Apply Reduce Animations, Text Size and the active language app-wide.
      builder: (context, child) {
        var data = MediaQuery.of(context);

        if (appearance.reduceAnimations) {
          data = data.copyWith(disableAnimations: true);
        }

        final scale = appearance.textScaleFactor;
        if (scale != 1.0) {
          data = data.copyWith(textScaler: TextScaler.linear(scale));
        }

        return MediaQuery(
          data: data,
          child: LanguageScope(
            controller: language,
            child: child!,
          ),
        );
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
