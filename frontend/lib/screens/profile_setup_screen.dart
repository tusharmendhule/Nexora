import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import 'package:image_picker/image_picker.dart';

import 'interests_screen.dart';
import '../services/user_service.dart';

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _bioController = TextEditingController();

  final UserService _userService = UserService();
  final ImagePicker _picker = ImagePicker();

  /// Bytes of the photo picked for the profile picture.
  Uint8List? _pickedAvatarBytes;
  String _pickedAvatarName = 'avatar.jpg';
  bool _isSaving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _usernameController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _pickProfileImage() async {
    final picked = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
      maxWidth: 1600,
    );

    if (picked == null) return;

    final bytes = await picked.readAsBytes();
    if (!mounted) return;

    setState(() {
      _pickedAvatarBytes = bytes;
      _pickedAvatarName = picked.name.isNotEmpty ? picked.name : 'avatar.jpg';
    });
  }

  Future<void> _saveAndContinue() async {
    final name = _nameController.text.trim();
    final username = _usernameController.text.trim().replaceFirst('@', '');

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Please enter your display name'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (username.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Please enter a username'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    setState(() {
      _isSaving = true;
    });

    try {
      // Save profile fields to the backend
      final updatedUser = await _userService.updateMyProfile(
        name: name,
        username: username,
        bio: _bioController.text.trim(),
      );

      // Upload avatar if a photo was picked (non-fatal on failure)
      if (_pickedAvatarBytes != null && updatedUser != null) {
        final uploaded = await _userService.uploadAvatar(
          _pickedAvatarBytes!,
          filename: _pickedAvatarName,
        );
        if (uploaded == null && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Your profile was saved but the profile picture could not be uploaded. You can retry later from Edit Profile.',
              ),
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      }

      if (!mounted) return;

      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (context) => const InterestsScreen(),
        ),
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to save profile. Please try again.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,

      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            children: [
              // Back button
              Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  padding: EdgeInsets.zero,
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  icon: Icon(
                    Icons.arrow_back,
                    color: context.nexora.textPrimary,
                    size: 25,
                  ),
                ),
              ),

              SizedBox(height: 18),

              // Title
              Text(
                'Set up your profile',
                style: TextStyle(
                  color: context.nexora.textPrimary,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),

              SizedBox(height: 6),

              Text(
                "Let's make your Nexora profile yours",
                style: TextStyle(
                  color: context.nexora.textSecondary,
                  fontSize: 13,
                ),
              ),

              SizedBox(height: 22),

              // Profile photo
              GestureDetector(
                onTap: _pickProfileImage,
                child: Stack(
                  alignment: Alignment.bottomRight,
                  children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: context.nexora.surfaceSelected,
                      ),
                      child: _pickedAvatarBytes != null
                          ? ClipOval(
                              child: Image.memory(
                                _pickedAvatarBytes!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Icon(
                                  Icons.person,
                                  color: context.nexora.textMuted,
                                  size: 42,
                                ),
                              ),
                            )
                          : Icon(
                              Icons.person,
                              color: context.nexora.textMuted,
                              size: 42,
                            ),
                    ),

                    Container(
                      width: 25,
                      height: 25,
                      decoration: BoxDecoration(
                        color: context.nexora.card,
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: context.nexora.textMuted,
                          width: 1,
                        ),
                      ),
                      child: Icon(
                        Icons.add,
                        color: context.nexora.textPrimary,
                        size: 17,
                      ),
                    ),
                  ],
                ),
              ),

              SizedBox(height: 8),

              GestureDetector(
                onTap: _pickProfileImage,
                child: Text(
                  'Add profile photo',
                  style: TextStyle(
                    color: Color(0xFF6C8CFF),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),

              SizedBox(height: 22),

              _inputField(
                controller: _nameController,
                hintText: 'Display name',
              ),

              SizedBox(height: 12),

              _inputField(
                controller: _usernameController,
                hintText: '@username',
              ),

              SizedBox(height: 12),

              _inputField(
                controller: _bioController,
                hintText: 'Tell us a little about yourself',
                maxLines: 3,
              ),

              const Spacer(),

              // Gradient Continue button
              Container(
                width: double.infinity,
                height: 52,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [
                      Color(0xFF2878E8),
                      Color(0xFF673DE6),
                    ],
                    begin: Alignment.centerLeft,
                    end: Alignment.centerRight,
                  ),
                  borderRadius: BorderRadius.circular(28),
                ),
                child: ElevatedButton(
                  onPressed: _isSaving ? null : _saveAndContinue,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.transparent,
                    shadowColor: Colors.transparent,
                    surfaceTintColor: Colors.transparent,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(28),
                    ),
                  ),
                  child: _isSaving
                      ? SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: context.nexora.textPrimary,
                            strokeWidth: 2,
                          ),
                        )
                      : Text(
                          'Continue',
                          style: TextStyle(
                            color: context.nexora.textPrimary,
                            fontSize: 14,
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

  Widget _inputField({
    required TextEditingController controller,
    required String hintText,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      style: TextStyle(
        color: context.nexora.textPrimary,
        fontSize: 14,
      ),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(
          color: context.nexora.textHint,
          fontSize: 14,
        ),
        filled: true,
        fillColor: context.nexora.field,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
      ),
    );
  }
}