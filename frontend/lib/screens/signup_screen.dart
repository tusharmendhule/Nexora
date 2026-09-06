import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../services/age_verification_service.dart';
import '../services/auth_service.dart';
import 'login_screen.dart';
import 'main_nav.dart';

/// UI phases of the signup screen. The age-assurance step lives on this
/// same screen (no extra page) and only appears after the backend has
/// created the account, so the existing registration form is unchanged.
enum _SignupPhase { form, verifying, blocked }

/// What the primary button on the blocked panel does.
enum _AgeAction { endpointRetry, repoll, none }

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  bool _isLoading = false;

  final AuthService _authService = AuthService();
  final AgeVerificationService _ageService = AgeVerificationService();

  _SignupPhase _phase = _SignupPhase.form;
  String _blockTitle = '';
  String _blockDetail = '';
  String _blockButtonLabel = '';
  _AgeAction _blockAction = _AgeAction.none;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleRegister() async {
    final name = _nameController.text.trim();
    final email = _emailController.text.trim();
    final password = _passwordController.text;

    if (name.isEmpty || email.isEmpty || password.isEmpty) {
      _showError(tr(context, 'All fields are required'));
      return;
    }

    if (password.length < 6) {
      _showError(tr(context, 'Password must be at least 6 characters'));
      return;
    }

    // Derive a username from email (part before @)
    final username = email.split('@').first.toLowerCase();

    setState(() => _isLoading = true);

    try {
      await _authService.register(
        email: email,
        password: password,
        name: name,
        username: username,
      );

      if (!mounted) return;

      // Account created server-side. Now run real age assurance against the
      // backend (the backend + provider own the result). Show the inline
      // step so the user sees a genuine outcome instead of a fake success.
      setState(() {
        _isLoading = false;
        _phase = _SignupPhase.verifying;
      });

      await _startAssurance(initial: true);
    } on AuthException catch (e) {
      if (mounted) setState(() => _isLoading = false);
      _showError(e.message);
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
      _showError(tr(context, 'Registration failed. Please try again.'));
    }
  }

  /// First attempt: initiate with the backend, then poll until it settles.
  Future<void> _startAssurance({required bool initial}) async {
    try {
      if (initial) {
        await _ageService.initiate();
      } else {
        await _ageService.retry();
      }
    } on AgeVerificationException catch (e) {
      if (!mounted) return;
      _handleEndpointError(e.message);
      return;
    } catch (e) {
      if (!mounted) return;
      _block(
        title: tr(context, "Couldn't reach the age check"),
        detail: tr(context, 'Please check your connection and try again.'),
        buttonLabel: tr(context, 'Try Again'),
        action: _AgeAction.repoll,
      );
      return;
    }
    await _pollUntilSettled();
  }

  /// Poll the backend status (real time passes between attempts). Settles
  /// on VERIFIED by entering the app; otherwise shows the real state.
  Future<void> _pollUntilSettled() async {
    if (!mounted) return;

    for (var attempt = 0; attempt < 7; attempt++) {
      Map<String, dynamic> status;
      try {
        status = await _ageService.getStatus();
      } catch (_) {
        // Transient poll failure — keep trying until the window ends.
        await Future<void>.delayed(const Duration(milliseconds: 900));
        continue;
      }

      final state = status['status']?.toString() ?? 'NOT_STARTED';

      if (state == 'VERIFIED') {
        if (!mounted) return;
        _goToMain();
        return;
      }

      if (state == 'FAILED') {
        if (!mounted) return;
        _block(
          title: tr(context, "We couldn't confirm your age"),
          detail: tr(context, 'Nothing personal was stored. You can try again.'),
          buttonLabel: tr(context, 'Try Again'),
          action: _AgeAction.endpointRetry,
        );
        return;
      }

      if (state == 'REQUIRES_REVIEW') {
        if (!mounted) return;
        _block(
          title: tr(context, 'Verification under review'),
          detail: tr(context,
              'Your age verification needs review before you can continue.'),
          buttonLabel: '',
          action: _AgeAction.none,
        );
        return;
      }

      // PENDING (or anything else) — wait and poll again.
      if (attempt < 6) {
        await Future<void>.delayed(const Duration(milliseconds: 900));
      }
    }

    if (!mounted) return;
    _block(
      title: tr(context, 'Age verification is still in progress'),
      detail: tr(context, 'Please check again in a moment.'),
      buttonLabel: tr(context, 'Check Again'),
      action: _AgeAction.repoll,
    );
  }

  /// Route an error returned by the initiate/retry endpoints to the right
  /// blocked state (never invent success).
  void _handleEndpointError(String message) {
    final lower = message.toLowerCase();
    final permanent = lower.contains('maximum retry') ||
        lower.contains('already completed') ||
        lower.contains('manual review');

    if (permanent) {
      _block(
        title: tr(context, 'Age verification unavailable'),
        detail: message,
        buttonLabel: '',
        action: _AgeAction.none,
      );
    } else if (lower.contains('unavailable') ||
        lower.contains('network') ||
        lower.contains('timeout')) {
      _block(
        title: tr(context, 'Age check is temporarily unavailable'),
        detail: message,
        buttonLabel: tr(context, 'Try Again'),
        action: _AgeAction.repoll,
      );
    } else {
      _block(
        title: tr(context, "We couldn't confirm your age"),
        detail: message,
        buttonLabel: tr(context, 'Try Again'),
        action: _AgeAction.endpointRetry,
      );
    }
  }

  void _block({
    required String title,
    required String detail,
    required String buttonLabel,
    required _AgeAction action,
  }) {
    if (!mounted) return;
    setState(() {
      _phase = _SignupPhase.blocked;
      _blockTitle = title;
      _blockDetail = detail;
      _blockButtonLabel = buttonLabel;
      _blockAction = action;
    });
  }

  Future<void> _onBlockActionPressed() async {
    if (_blockAction == _AgeAction.none) return;
    if (!mounted) return;
    setState(() => _phase = _SignupPhase.verifying);
    if (_blockAction == _AgeAction.endpointRetry) {
      // A real retry: the backend re-opens verification with the provider
      // and enforces the attempt limit.
      await _startAssurance(initial: false);
    } else {
      await _pollUntilSettled();
    }
  }

  void _goToMain() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (context) => const MainNavigation()),
      (route) => false,
    );
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.redAccent,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(height: 55),

              Text(
                tr(context, 'Create Account'),
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                ),
              ),

              SizedBox(height: 10),

              Text(
                tr(context, 'Join Nexora and start connecting.'),
                style: TextStyle(color: context.nexora.textSecondary, fontSize: 16),
              ),

              SizedBox(height: 40),

              // The registration form (unchanged) or the inline
              // age-assurance step once the account exists.
              if (_phase == _SignupPhase.form) ..._formFields(),
              if (_phase != _SignupPhase.form) ..._assurancePanel(),
            ],
          ),
        ),
      ),
    );
  }

  /// The existing signup form — layout, labels and styles untouched.
  List<Widget> _formFields() {
    return [
      Text(tr(context, 'Name'),
          style: TextStyle(color: context.nexora.textPrimary)),

      const SizedBox(height: 8),

      _field(tr(context, 'Enter your name'), controller: _nameController),

      const SizedBox(height: 20),

      Text(tr(context, 'Email'),
          style: TextStyle(color: context.nexora.textPrimary)),

      const SizedBox(height: 8),

      _field(
        tr(context, 'Enter your email'),
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
      ),

      const SizedBox(height: 20),

      Text(tr(context, 'Password'),
          style: TextStyle(color: context.nexora.textPrimary)),

      const SizedBox(height: 8),

      _field(
        tr(context, 'Create a password'),
        controller: _passwordController,
        obscureText: true,
      ),

      const SizedBox(height: 35),

      SizedBox(
        width: double.infinity,
        height: 54,
        child: ElevatedButton(
          onPressed: _isLoading ? null : _handleRegister,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF6C63FF),
            foregroundColor: context.nexora.textPrimary,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          child: _isLoading
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: context.nexora.textPrimary,
                    strokeWidth: 2.5,
                  ),
                )
              : Text(
                  tr(context, 'Create Account'),
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w600,
                  ),
                ),
        ),
      ),

      const SizedBox(height: 25),

      _signInLink(),
    ];
  }

  /// Inline age-assurance step (progress / result). Uses the exact same
  /// visual language as the rest of the screen; no new page.
  List<Widget> _assurancePanel() {
    if (_phase == _SignupPhase.verifying) {
      return [
        const SizedBox(height: 30),
        Center(
          child: SizedBox(
            width: 46,
            height: 46,
            child: CircularProgressIndicator(
              color: const Color(0xFF6C63FF),
              strokeWidth: 3,
            ),
          ),
        ),
        const SizedBox(height: 22),
        Center(
          child: Text(
            tr(context, 'Verifying your age…'),
            style: TextStyle(
              color: context.nexora.textSecondary,
              fontSize: 15,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            tr(context,
                'Only an age result is stored — no documents or date of birth.'),
            textAlign: TextAlign.center,
            style: TextStyle(color: context.nexora.textHint, fontSize: 12.5),
          ),
        ),
        const SizedBox(height: 60),
      ];
    }

    // Blocked (non-verified outcome): show the real state with retry where
    // the backend allows it.
    return [
      const SizedBox(height: 26),
      Center(
        child: Icon(
          Icons.shield_outlined,
          color: context.nexora.textMuted,
          size: 44,
        ),
      ),
      const SizedBox(height: 18),
      Center(
        child: Text(
          _blockTitle,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      const SizedBox(height: 8),
      Center(
        child: Text(
          _blockDetail,
          textAlign: TextAlign.center,
          style: TextStyle(color: context.nexora.textMuted, fontSize: 13.5),
        ),
      ),
      if (_blockAction != _AgeAction.none) ...[
        const SizedBox(height: 30),
        SizedBox(
          width: double.infinity,
          height: 54,
          child: ElevatedButton(
            onPressed: _onBlockActionPressed,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF6C63FF),
              foregroundColor: context.nexora.textPrimary,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: Text(
              _blockButtonLabel,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
      const SizedBox(height: 20),
      _signInLink(),
    ];
  }

  /// Existing bottom sign-in link (kept identical to the original form).
  Widget _signInLink() {
    return Center(
      child: RichText(
        text: TextSpan(
          children: [
            TextSpan(
              text: tr(context, 'Already have an account? '),
              style:
                  TextStyle(color: context.nexora.textSecondary, fontSize: 14),
            ),
            WidgetSpan(
              child: GestureDetector(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => const LoginScreen(),
                    ),
                  );
                },
                child: Text(
                  tr(context, 'Sign In'),
                  style: TextStyle(
                    color: Color(0xFF8B7CFF),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    String hint, {
    bool obscureText = false,
    TextEditingController? controller,
    TextInputType? keyboardType,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      style: TextStyle(color: context.nexora.textPrimary),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: context.nexora.textHint),
        filled: true,
        fillColor: context.nexora.card,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}
