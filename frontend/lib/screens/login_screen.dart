import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';

import '../services/appearance_controller.dart';

import '../services/auth_service.dart';
import '../widgets/server_address_dialog.dart';
import 'main_nav.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  /// Optional username/email to prefill (e.g. when switching accounts).
  final String? initialUsername;

  const LoginScreen({super.key, this.initialUsername});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  late final TextEditingController emailController =
      TextEditingController(text: widget.initialUsername ?? '');
  final TextEditingController passwordController = TextEditingController();

  bool obscurePassword = true;
  bool isLoading = false;

  final AuthService _authService = AuthService();

  @override
  void dispose() {
    emailController.dispose();
    passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final identifier = emailController.text.trim();
    final password = passwordController.text;

    if (identifier.isEmpty || password.isEmpty) {
      _showError(
          tr(context, 'Please enter your email/username and password'));
      return;
    }

    setState(() => isLoading = true);

    try {
      await _authService.login(
        identifier: identifier,
        password: password,
      );

      if (!mounted) return;

      // Navigate to main app
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (context) => const MainNavigation()),
        (route) => false,
      );
    } on AuthException catch (e) {
      _showError(e.message);
    } catch (e) {
      _showError(tr(context, 'Login failed. Please try again.'));
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  Future<void> _handleGoogleSignIn() async {
    setState(() => isLoading = true);

    try {
      await _authService.signInWithGoogle();

      if (!mounted) return;

      // Navigate to main app
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (context) => const MainNavigation()),
        (route) => false,
      );
    } on AuthException catch (e) {
      if (e.message != 'Sign-in cancelled') {
        _showError(e.message);
      }
    } catch (e) {
      _showError(tr(context, 'Google sign-in failed. Please try again.'));
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
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
          padding: const EdgeInsets.fromLTRB(24, 35, 24, 30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _logo(),
                  const Spacer(),
                  // Backend server address — reachable even before sign-in,
                  // since network failures happen right here on this screen.
                  IconButton(
                    tooltip: tr(context, 'Server address'),
                    onPressed: () => showServerAddressDialog(context),
                    icon: Icon(
                      Icons.settings_outlined,
                      color: context.nexora.textHint,
                    ),
                  ),
                ],
              ),

              SizedBox(height: 34),

              Text(
                tr(context, 'Welcome back'),
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                ),
              ),

              SizedBox(height: 8),

              Text(
                tr(context, 'Sign in to continue to Nexora.'),
                style: TextStyle(color: context.nexora.textMuted, fontSize: 14),
              ),

              SizedBox(height: 34),

              Text(
                tr(context, 'Email or username'),
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),

              SizedBox(height: 8),

              _textField(
                controller: emailController,
                hint: tr(context, 'Enter your email or username'),
                icon: Icons.person_outline,
                keyboardType: TextInputType.emailAddress,
              ),

              SizedBox(height: 20),

              Text(
                tr(context, 'Password'),
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),

              SizedBox(height: 8),

              _textField(
                controller: passwordController,
                hint: tr(context, 'Enter your password'),
                icon: Icons.lock_outline,
                obscureText: obscurePassword,
                suffixIcon: IconButton(
                  onPressed: () {
                    setState(() {
                      obscurePassword = !obscurePassword;
                    });
                  },
                  icon: Icon(
                    obscurePassword
                        ? Icons.visibility_off_outlined
                        : Icons.visibility_outlined,
                    color: context.nexora.textHint,
                    size: 21,
                  ),
                ),
              ),

              SizedBox(height: 12),

              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () async {
                    final controller = TextEditingController();
                    final result = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        backgroundColor: context.nexora.card,
                        title: Text(tr(ctx, 'Reset Password'),
                            style: TextStyle(color: context.nexora.textPrimary)),
                        content: TextField(
                          controller: controller,
                          style: TextStyle(color: context.nexora.textPrimary),
                          decoration: InputDecoration(
                            hintText: tr(ctx, 'Enter your email'),
                            hintStyle: TextStyle(color: context.nexora.textHint),
                          ),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, false),
                            child: Text(tr(ctx, 'Cancel'),
                                style: TextStyle(color: context.nexora.textSecondary)),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pop(ctx, true),
                            child: Text(tr(ctx, 'Send'),
                                style: TextStyle(color: Color(0xFF8B7CFF))),
                          ),
                        ],
                      ),
                    );
                    if (result == true && mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(tr(context,
                              'Password reset email sent. Check your inbox.')),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  },
                  child: Text(
                    tr(context, 'Forgot password?'),
                    style: TextStyle(
                      color: Color(0xFF8B7CFF),
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),

              SizedBox(height: 16),

              _loginButton(),

              SizedBox(height: 25),

              Row(
                children: [
                  Expanded(
                    child: Divider(color: context.nexora.textPrimary.withOpacity(0.08)),
                  ),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 14),
                    child: Text(
                      tr(context, 'OR'),
                      style: TextStyle(
                        color: context.nexora.textHint,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Divider(color: context.nexora.textPrimary.withOpacity(0.08)),
                  ),
                ],
              ),

              SizedBox(height: 20),

              _socialButton(
                icon: Icons.g_mobiledata_rounded,
                label: tr(context, 'Continue with Google'),
                onTap: isLoading ? () {} : _handleGoogleSignIn,
              ),

              SizedBox(height: 12),

              _socialButton(
                icon: Icons.apple,
                label: tr(context, 'Continue with Apple'),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                          tr(context, 'Apple Sign-In is not yet available')),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              ),

              SizedBox(height: 32),

              Center(
                child: Wrap(
                  alignment: WrapAlignment.center,
                  children: [
                    Text(
                      tr(context, "Don't have an account? "),
                      style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                    ),
                    GestureDetector(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (context) => const SignUpScreen(),
                          ),
                        );
                      },
                      child: Text(
                        tr(context, 'Create Account'),
                        style: TextStyle(
                          color: Color(0xFF8B7CFF),
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _logo() {
    return Container(
      width: 58,
      height: 58,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(
          colors: nexoraGradient(),
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Icon(
        Icons.auto_awesome_rounded,
        color: context.nexora.textPrimary,
        size: 30,
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscureText = false,
    TextInputType? keyboardType,
    Widget? suffixIcon,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
      ),
      child: TextField(
        controller: controller,
        obscureText: obscureText,
        keyboardType: keyboardType,
        style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(color: context.nexora.textHint, fontSize: 13),
          prefixIcon: Icon(
            icon,
            color: context.nexora.textPrimary.withOpacity(0.45),
            size: 21,
          ),
          suffixIcon: suffixIcon,
          border: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
        ),
      ),
    );
  }

  Widget _loginButton() {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            colors: nexoraGradient(),
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: ElevatedButton(
          onPressed: isLoading ? null : _handleLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            shadowColor: Colors.transparent,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: isLoading
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    color: context.nexora.textPrimary,
                    strokeWidth: 2.5,
                  ),
                )
              : Text(
                  tr(context, 'Sign In'),
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _socialButton({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: OutlinedButton.icon(
        onPressed: onTap,
        icon: Icon(icon, color: context.nexora.textSecondary, size: 23),
        label: Text(
          label,
          style: TextStyle(
            color: context.nexora.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        style: OutlinedButton.styleFrom(
          backgroundColor: context.nexora.card,
          side: BorderSide(color: context.nexora.textPrimary.withOpacity(0.07)),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(15),
          ),
        ),
      ),
    );
  }
}
