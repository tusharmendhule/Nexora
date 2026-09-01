import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/user.dart';

class EditProfileScreen extends StatefulWidget {
  final User user;
  final Future<void> Function({
    required String displayName,
    required String username,
    required String bio,
    String? profileImagePath,
  })?
  onSave;

  const EditProfileScreen({super.key, required this.user, this.onSave});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _displayNameController;
  late final TextEditingController _usernameController;
  late final TextEditingController _bioController;

  final ImagePicker _picker = ImagePicker();

  String? _profileImagePath;
  bool _saving = false;

  @override
  void initState() {
    super.initState();

    _displayNameController = TextEditingController(
      text: widget.user.displayName ?? '',
    );

    _usernameController = TextEditingController(text: widget.user.username);

    _bioController = TextEditingController(text: widget.user.bio ?? '');

    _profileImagePath = widget.user.profileImageUrl;
  }

  @override
  void dispose() {
    _displayNameController.dispose();
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

  Future<void> _saveProfile() async {
    if (!_formKey.currentState!.validate() || _saving) return;

    FocusScope.of(context).unfocus();

    setState(() {
      _saving = true;
    });

    try {
      if (widget.onSave != null) {
        await widget.onSave!(
          displayName: _displayNameController.text.trim(),
          username: _usernameController.text.trim(),
          bio: _bioController.text.trim(),
          profileImagePath: _profileImagePath,
        );
      }

      if (!mounted) return;

      Navigator.pop(context, <String, dynamic>{
        'displayName': _displayNameController.text.trim(),
        'username': _usernameController.text.trim(),
        'bio': _bioController.text.trim(),
        'profileImagePath': _profileImagePath,
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _saving = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not save profile. Please try again.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF080B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080B1A),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text(
          'Edit Profile',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _saveProfile,
            child: const Text(
              'Save',
              style: TextStyle(
                color: Color(0xFF7C61FF),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
            children: [
              _profilePhotoSection(),

              const SizedBox(height: 30),

              _fieldLabel('Display Name'),
              const SizedBox(height: 8),
              _textField(
                controller: _displayNameController,
                hint: 'Your display name',
                textCapitalization: TextCapitalization.words,
              ),

              const SizedBox(height: 20),

              _fieldLabel('Username'),
              const SizedBox(height: 8),
              _textField(
                controller: _usernameController,
                hint: 'username',
                prefixText: '@',
              ),

              const SizedBox(height: 20),

              _fieldLabel('Bio'),
              const SizedBox(height: 8),
              _textField(
                controller: _bioController,
                hint: 'Tell people about yourself...',
                maxLines: 4,
                maxLength: 160,
              ),

              const SizedBox(height: 28),

              _saveButton(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profilePhotoSection() {
    final hasImage = _profileImagePath != null && _profileImagePath!.isNotEmpty;

    return Column(
      children: [
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            Container(
              width: 112,
              height: 112,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF7C61FF), width: 2),
                gradient: const LinearGradient(
                  colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              padding: const EdgeInsets.all(3),
              child: ClipOval(
                child: hasImage
                    ? _buildProfileImage(_profileImagePath!)
                    : const ColoredBox(
                        color: Color(0xFF171D35),
                        child: Icon(
                          Icons.person,
                          color: Colors.white70,
                          size: 55,
                        ),
                      ),
              ),
            ),
            GestureDetector(
              onTap: _pickProfileImage,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
                  ),
                  border: Border.all(color: const Color(0xFF080B1A), width: 3),
                ),
                child: const Icon(
                  Icons.camera_alt_outlined,
                  color: Colors.white,
                  size: 17,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _pickProfileImage,
          child: const Text(
            'Change Profile Photo',
            style: TextStyle(
              color: Color(0xFF9C8CFF),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildProfileImage(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return Image.network(
        path,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) {
          return const ColoredBox(
            color: Color(0xFF171D35),
            child: Icon(Icons.person, color: Colors.white70, size: 55),
          );
        },
      );
    }

    return Image.file(
      File(path),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) {
        return const ColoredBox(
          color: Color(0xFF171D35),
          child: Icon(Icons.person, color: Colors.white70, size: 55),
        );
      },
    );
  }

  Widget _fieldLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    String? prefixText,
    int maxLines = 1,
    int? maxLength,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      maxLength: maxLength,
      textCapitalization: textCapitalization,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      validator: (value) {
        if (controller == _usernameController &&
            (value == null || value.trim().isEmpty)) {
          return 'Username cannot be empty';
        }

        return null;
      },
      decoration: InputDecoration(
        prefixText: prefixText,
        prefixStyle: const TextStyle(color: Colors.white70, fontSize: 14),
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
        counterStyle: const TextStyle(color: Colors.white38, fontSize: 11),
        filled: true,
        fillColor: const Color(0xFF151A2E),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 15,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xFF26345F)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xFF7C61FF), width: 1.2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xFFE74C3C)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: const BorderSide(color: Color(0xFFE74C3C), width: 1.2),
        ),
      ),
    );
  }

  Widget _saveButton() {
    return SizedBox(
      width: double.infinity,
      height: 54,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(
            colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: ElevatedButton(
          onPressed: _saving ? null : _saveProfile,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            foregroundColor: Colors.white,
            shadowColor: Colors.transparent,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: _saving
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Text(
                  'Save Changes',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
        ),
      ),
    );
  }
}
