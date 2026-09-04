import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';
import 'package:image_picker/image_picker.dart';

import '../models/user.dart';

class EditProfileScreen extends StatefulWidget {
  final User user;
  final Future<void> Function({
    required String displayName,
    required String username,
    required String bio,
    Uint8List? profileImageBytes,
    String? profileImageFilename,
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

  /// Bytes of a newly picked photo (only set when the user chose a new one).
  Uint8List? _pickedAvatarBytes;
  String _pickedAvatarName = 'avatar.jpg';
  bool _saving = false;

  @override
  void initState() {
    super.initState();

    _displayNameController = TextEditingController(
      text: widget.user.displayName ?? '',
    );

    _usernameController = TextEditingController(text: widget.user.username);

    _bioController = TextEditingController(text: widget.user.bio ?? '');
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
          profileImageBytes: _pickedAvatarBytes,
          profileImageFilename: _pickedAvatarName,
        );
      }

      if (!mounted) return;

      Navigator.pop(context, <String, dynamic>{
        'displayName': _displayNameController.text.trim(),
        'username': _usernameController.text.trim(),
        'bio': _bioController.text.trim(),
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        _saving = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not save profile. Please try again.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.backgroundAlt,
      appBar: AppBar(
        backgroundColor: context.nexora.backgroundAlt,
        foregroundColor: context.nexora.textPrimary,
        elevation: 0,
        title: Text(
          'Edit Profile',
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w600),
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _saveProfile,
            child: Text(
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

              SizedBox(height: 30),

              _fieldLabel('Display Name'),
              SizedBox(height: 8),
              _textField(
                controller: _displayNameController,
                hint: 'Your display name',
                textCapitalization: TextCapitalization.words,
              ),

              SizedBox(height: 20),

              _fieldLabel('Username'),
              SizedBox(height: 8),
              _textField(
                controller: _usernameController,
                hint: 'username',
                prefixText: '@',
              ),

              SizedBox(height: 20),

              _fieldLabel('Bio'),
              SizedBox(height: 8),
              _textField(
                controller: _bioController,
                hint: 'Tell people about yourself...',
                maxLines: 4,
                maxLength: 160,
              ),

              SizedBox(height: 28),

              _saveButton(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _profilePhotoSection() {
    final existingUrl = widget.user.profileImageUrl;
    final hasImage = _pickedAvatarBytes != null ||
        (existingUrl != null && existingUrl.isNotEmpty);

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
                gradient: LinearGradient(
                  colors: nexoraGradient(),
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
              ),
              padding: const EdgeInsets.all(3),
              child: ClipOval(
                child: hasImage
                    ? _avatarPreview()
                    : _avatarPlaceholder(),
              ),
            ),
            GestureDetector(
              onTap: _pickProfileImage,
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: nexoraGradient(),
                  ),
                  border: Border.all(color: context.nexora.backgroundAlt, width: 3),
                ),
                child: Icon(
                  Icons.camera_alt_outlined,
                  color: context.nexora.textPrimary,
                  size: 17,
                ),
              ),
            ),
          ],
        ),
        SizedBox(height: 12),
        TextButton(
          onPressed: _pickProfileImage,
          child: Text(
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

  /// Preview for the avatar circle: shows a newly picked photo first, then
  /// the existing profile picture, then a placeholder.
  Widget _avatarPreview() {
    final bytes = _pickedAvatarBytes;
    if (bytes != null) {
      return Image.memory(
        bytes,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _avatarPlaceholder(),
      );
    }

    final url = widget.user.profileImageUrl;
    if (url != null && url.isNotEmpty &&
        (url.startsWith('http://') || url.startsWith('https://'))) {
      return Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _avatarPlaceholder(),
      );
    }

    return _avatarPlaceholder();
  }

  Widget _avatarPlaceholder() {
    return ColoredBox(
      color: context.nexora.card,
      child: Icon(
        Icons.person,
        color: context.nexora.textSecondary,
        size: 55,
      ),
    );
  }

  Widget _fieldLabel(String text) {
    return Text(
      text,
      style: TextStyle(
        color: context.nexora.textPrimary,
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
      style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
      validator: (value) {
        if (controller == _usernameController &&
            (value == null || value.trim().isEmpty)) {
          return 'Username cannot be empty';
        }

        return null;
      },
      decoration: InputDecoration(
        prefixText: prefixText,
        prefixStyle: TextStyle(color: context.nexora.textSecondary, fontSize: 14),
        hintText: hint,
        hintStyle: TextStyle(color: context.nexora.textHint, fontSize: 14),
        counterStyle: TextStyle(color: context.nexora.textHint, fontSize: 11),
        filled: true,
        fillColor: context.nexora.field,
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
          borderSide: BorderSide(color: context.nexora.surfaceSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide(color: Color(0xFF7C61FF), width: 1.2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide(color: Color(0xFFE74C3C)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(15),
          borderSide: BorderSide(color: Color(0xFFE74C3C), width: 1.2),
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
          gradient: LinearGradient(
            colors: nexoraGradient(),
            begin: Alignment.centerLeft,
            end: Alignment.centerRight,
          ),
        ),
        child: ElevatedButton(
          onPressed: _saving ? null : _saveProfile,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.transparent,
            disabledBackgroundColor: Colors.transparent,
            foregroundColor: context.nexora.textPrimary,
            shadowColor: Colors.transparent,
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
          child: _saving
              ? SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: context.nexora.textPrimary,
                  ),
                )
              : Text(
                  'Save Changes',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
        ),
      ),
    );
  }
}
