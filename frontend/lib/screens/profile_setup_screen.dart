import 'dart:io';

import 'package:flutter/material.dart';
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

  String? _profileImagePath;
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
    );

    if (picked == null) return;

    setState(() {
      _profileImagePath = picked.path;
    });
  }

  Future<void> _saveAndContinue() async {
    final name = _nameController.text.trim();
    final username = _usernameController.text.trim().replaceFirst('@', '');

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter your display name'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (username.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
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

      // Upload avatar if selected
      if (_profileImagePath != null && updatedUser != null) {
        await _userService.uploadAvatar(File(_profileImagePath!));
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
        const SnackBar(
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
      backgroundColor: const Color(0xFF080B1A),

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
                  icon: const Icon(
                    Icons.arrow_back,
                    color: Colors.white,
                    size: 25,
                  ),
                ),
              ),

              const SizedBox(height: 18),

              // Title
              const Text(
                'Set up your profile',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
              ),

              const SizedBox(height: 6),

              const Text(
                "Let's make your Nexora profile yours",
                style: TextStyle(
                  color: Colors.white60,
                  fontSize: 13,
                ),
              ),

              const SizedBox(height: 22),

              // Profile photo
              GestureDetector(
                onTap: _pickProfileImage,
                child: Stack(
                  alignment: Alignment.bottomRight,
                  children: [
                    Container(
                      width: 78,
                      height: 78,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color(0xFF242A43),
                      ),
                      child: _profileImagePath != null
                          ? ClipOval(
                              child: _profileImagePath!.startsWith('http')
                                  ? Image.network(
                                      _profileImagePath!,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          const Icon(Icons.person, color: Colors.white54, size: 42),
                                    )
                                  : Image.file(
                                      File(_profileImagePath!),
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) =>
                                          const Icon(Icons.person, color: Colors.white54, size: 42),
                                    ),
                            )
                          : const Icon(
                              Icons.person,
                              color: Colors.white54,
                              size: 42,
                            ),
                    ),

                    Container(
                      width: 25,
                      height: 25,
                      decoration: BoxDecoration(
                        color: const Color(0xFF171D35),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white54,
                          width: 1,
                        ),
                      ),
                      child: const Icon(
                        Icons.add,
                        color: Colors.white,
                        size: 17,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 8),

              GestureDetector(
                onTap: _pickProfileImage,
                child: const Text(
                  'Add profile photo',
                  style: TextStyle(
                    color: Color(0xFF6C8CFF),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),

              const SizedBox(height: 22),

              _inputField(
                controller: _nameController,
                hintText: 'Display name',
              ),

              const SizedBox(height: 12),

              _inputField(
                controller: _usernameController,
                hintText: '@username',
              ),

              const SizedBox(height: 12),

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
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Text(
                          'Continue',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),

              const SizedBox(height: 20),
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
      style: const TextStyle(
        color: Colors.white,
        fontSize: 14,
      ),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: const TextStyle(
          color: Colors.white38,
          fontSize: 14,
        ),
        filled: true,
        fillColor: const Color(0xFF151A2E),
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