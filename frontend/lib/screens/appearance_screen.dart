import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';

import '../services/appearance_controller.dart';
import 'settings_detail_screen.dart';

class AppearanceScreen extends StatefulWidget {
  const AppearanceScreen({super.key});

  @override
  State<AppearanceScreen> createState() => _AppearanceScreenState();
}

class _AppearanceScreenState extends State<AppearanceScreen> {
  final AppearanceController _controller = AppearanceController.instance;

  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    // Rebuild whenever the centralized appearance state changes.
    _controller.addListener(_onControllerChanged);
    _refresh();
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _refresh() async {
    // Re-sync from persistence (local cache + backend for the user).
    await _controller.load();
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.nexora.background,
      appBar: AppBar(
        backgroundColor: context.nexora.background,
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new,
            color: context.nexora.textPrimary,
            size: 20,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          'Appearance',
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: _isLoading
          ? Center(
              child: CircularProgressIndicator(color: context.nexora.textPrimary),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(18, 10, 18, 30),
              children: [
                _sectionTitle('Theme'),

                _settingCard(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 5,
                    ),
                    leading: _iconBox(Icons.dark_mode_outlined),
                    title: Text(
                      'Dark Mode',
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Use Nexora with a dark appearance',
                        style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                      ),
                    ),
                    trailing: Switch(
                      value: _controller.darkMode,
                      onChanged: (value) {
                        _controller.setDarkMode(value);
                      },
                      activeColor: Colors.white,
                      activeTrackColor: const Color(0xFF5B5FEF),
                      inactiveThumbColor: context.nexora.textSecondary,
                      inactiveTrackColor: context.nexora.switchTrack,
                    ),
                  ),
                ),

                SizedBox(height: 24),

                _sectionTitle('Nexora Gradient'),

                Text(
                  'Choose the gradient that defines your Nexora experience.',
                  style: TextStyle(color: context.nexora.textMuted, fontSize: 13),
                ),

                SizedBox(height: 14),

                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: kNexoraGradients.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.55,
                  ),
                  itemBuilder: (context, index) {
                    final isSelected = _controller.selectedGradient == index;

                    return GestureDetector(
                      onTap: () {
                        _controller.setSelectedGradient(index);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: kNexoraGradients[index],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: isSelected
                                ? context.nexora.textPrimary
                                : context.nexora.textPrimary.withOpacity(0.08),
                            width: isSelected ? 2 : 1,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: kNexoraGradients[index][0]
                                        .withOpacity(0.25),
                                    blurRadius: 14,
                                    spreadRadius: 1,
                                  ),
                                ]
                              : null,
                        ),
                        child: Stack(
                          children: [
                            Positioned(
                              left: 14,
                              bottom: 12,
                              child: Text(
                                kNexoraGradientNames[index],
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (isSelected)
                              Positioned(
                                top: 10,
                                right: 10,
                                child: Icon(
                                  Icons.check_circle,
                                  color: Colors.white,
                                  size: 21,
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),

                SizedBox(height: 24),

                _sectionTitle('Interface'),

                _settingCard(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 5,
                    ),
                    leading: _iconBox(Icons.animation_outlined),
                    title: Text(
                      'Reduce Animations',
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Reduce movement throughout Nexora',
                        style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                      ),
                    ),
                    trailing: Switch(
                      value: _controller.reduceAnimations,
                      onChanged: (value) {
                        _controller.setReduceAnimations(value);
                      },
                      activeColor: Colors.white,
                      activeTrackColor: const Color(0xFF5B5FEF),
                      inactiveThumbColor: context.nexora.textSecondary,
                      inactiveTrackColor: context.nexora.switchTrack,
                    ),
                  ),
                ),

                _settingCard(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 5,
                    ),
                    leading: _iconBox(Icons.text_fields_outlined),
                    title: Text(
                      'Text Size',
                      style: TextStyle(
                        color: context.nexora.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Adjust the size of text across Nexora',
                        style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
                      ),
                    ),
                    trailing: Icon(Icons.chevron_right, color: context.nexora.textHint),
                    onTap: () {
                      final currentSize = _controller.textSize;

                      Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (context) => SettingsDetailScreen(
                            title: 'Text Size',
                            description: 'Adjust the size of text across Nexora.',
                            sections: [
                              SettingsSection(
                                title: 'Text Size',
                                items: [
                                  SettingsItem(
                                    icon: Icons.text_fields_outlined,
                                    title: 'Small',
                                    subtitle: 'Use smaller text throughout Nexora',
                                    type: SettingsItemType.selection,
                                    valueText: currentSize == 'small'
                                        ? 'Selected'
                                        : '',
                                    onTap: () {
                                      _controller.setTextSize('small');
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Text size set to Small'),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                      Navigator.pop(context);
                                    },
                                  ),
                                  SettingsItem(
                                    icon: Icons.text_fields_outlined,
                                    title: 'Medium',
                                    subtitle: 'Use the default text size',
                                    type: SettingsItemType.selection,
                                    valueText: currentSize == 'medium'
                                        ? 'Selected'
                                        : '',
                                    onTap: () {
                                      _controller.setTextSize('medium');
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Text size set to Medium'),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                      Navigator.pop(context);
                                    },
                                  ),
                                  SettingsItem(
                                    icon: Icons.text_fields_outlined,
                                    title: 'Large',
                                    subtitle: 'Use larger text throughout Nexora',
                                    type: SettingsItemType.selection,
                                    valueText: currentSize == 'large'
                                        ? 'Selected'
                                        : '',
                                    onTap: () {
                                      _controller.setTextSize('large');
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        const SnackBar(
                                          content: Text('Text size set to Large'),
                                          behavior: SnackBarBehavior.floating,
                                        ),
                                      );
                                      Navigator.pop(context);
                                    },
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),

                SizedBox(height: 30),

                Center(
                  child: Text(
                    'Your Nexora, your style.',
                    style: TextStyle(
                      color: context.nexora.textPrimary.withOpacity(0.35),
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _sectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 10),
      child: Text(
        title,
        style: TextStyle(
          color: context.nexora.textMuted,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
        ),
      ),
    );
  }

  Widget _settingCard({required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: context.nexora.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.nexora.textPrimary.withOpacity(0.05)),
      ),
      child: child,
    );
  }

  Widget _iconBox(IconData icon) {
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(13),
        gradient: LinearGradient(
          colors: nexoraGradient(),
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Icon(icon, color: Colors.white, size: 21),
    );
  }
}