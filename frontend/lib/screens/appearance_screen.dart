import 'package:flutter/material.dart';

import '../services/settings_service.dart';
import 'settings_detail_screen.dart';

class AppearanceScreen extends StatefulWidget {
  const AppearanceScreen({super.key});

  @override
  State<AppearanceScreen> createState() => _AppearanceScreenState();
}

class _AppearanceScreenState extends State<AppearanceScreen> {
  final SettingsService _settingsService = SettingsService();

  bool darkMode = true;
  bool reduceAnimations = false;
  int selectedGradient = 0;

  bool _isLoading = true;

  final List<List<Color>> gradients = [
    [const Color(0xFF3157D5), const Color(0xFF7C3AED)],
    [const Color(0xFF16A34A), const Color(0xFFEAB308)],
    [const Color(0xFFEF4444), const Color(0xFFF59E0B)],
    [const Color(0xFFEC4899), const Color(0xFF22C55E)],
    [const Color(0xFFF59E0B), const Color(0xFFEC4899)],
    [const Color(0xFFF97316), const Color(0xFF8B5CF6)],
  ];

  final List<String> gradientNames = [
    'Nexora',
    'Green Sunrise',
    'Solar',
    'Pink Meadow',
    'Sunset Pink',
    'Orange Purple',
  ];

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final settings = await _settingsService.getSettings();

    if (!mounted) return;

    if (settings.isNotEmpty) {
      setState(() {
        darkMode = settings['darkMode'] ?? true;
        reduceAnimations = settings['reduceAnimations'] ?? false;
        selectedGradient = settings['selectedGradient'] ?? 0;
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    await _settingsService.updateSettings({
      'darkMode': darkMode,
      'theme': darkMode ? 'dark' : 'light',
      'reduceAnimations': reduceAnimations,
      'selectedGradient': selectedGradient,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        centerTitle: true,
        leading: IconButton(
          icon: const Icon(
            Icons.arrow_back_ios_new,
            color: Colors.white,
            size: 20,
          ),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text(
          'Appearance',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Colors.white),
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
                    title: const Text(
                      'Dark Mode',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Use Nexora with a dark appearance',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                    trailing: Switch(
                      value: darkMode,
                      onChanged: (value) {
                        setState(() {
                          darkMode = value;
                        });
                        _saveSettings();
                      },
                      activeColor: Colors.white,
                      activeTrackColor: const Color(0xFF5B5FEF),
                      inactiveThumbColor: Colors.white70,
                      inactiveTrackColor: const Color(0xFF30364F),
                    ),
                  ),
                ),

                const SizedBox(height: 24),

                _sectionTitle('Nexora Gradient'),

                const Text(
                  'Choose the gradient that defines your Nexora experience.',
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),

                const SizedBox(height: 14),

                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: gradients.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.55,
                  ),
                  itemBuilder: (context, index) {
                    final isSelected = selectedGradient == index;

                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          selectedGradient = index;
                        });
                        _saveSettings();
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: gradients[index],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: isSelected
                                ? Colors.white
                                : Colors.white.withOpacity(0.08),
                            width: isSelected ? 2 : 1,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: gradients[index][0].withOpacity(0.25),
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
                                gradientNames[index],
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            if (isSelected)
                              const Positioned(
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

                const SizedBox(height: 24),

                _sectionTitle('Interface'),

                _settingCard(
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 5,
                    ),
                    leading: _iconBox(Icons.animation_outlined),
                    title: const Text(
                      'Reduce Animations',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Reduce movement throughout Nexora',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                    trailing: Switch(
                      value: reduceAnimations,
                      onChanged: (value) {
                        setState(() {
                          reduceAnimations = value;
                        });
                        _saveSettings();
                      },
                      activeColor: Colors.white,
                      activeTrackColor: const Color(0xFF5B5FEF),
                      inactiveThumbColor: Colors.white70,
                      inactiveTrackColor: const Color(0xFF30364F),
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
                    title: const Text(
                      'Text Size',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: const Padding(
                      padding: EdgeInsets.only(top: 3),
                      child: Text(
                        'Adjust the size of text across Nexora',
                        style: TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: Colors.white38),
                    onTap: () {
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
                                    valueText: '',
                                    onTap: () {},
                                  ),
                                  SettingsItem(
                                    icon: Icons.text_fields_outlined,
                                    title: 'Medium',
                                    subtitle: 'Use the default text size',
                                    type: SettingsItemType.selection,
                                    valueText: 'Selected',
                                    onTap: () {},
                                  ),
                                  SettingsItem(
                                    icon: Icons.text_fields_outlined,
                                    title: 'Large',
                                    subtitle: 'Use larger text throughout Nexora',
                                    type: SettingsItemType.selection,
                                    valueText: '',
                                    onTap: () {},
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

                const SizedBox(height: 30),

                Center(
                  child: Text(
                    'Your Nexora, your style.',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.35),
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
        style: const TextStyle(
          color: Colors.white54,
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
        color: const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
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
        gradient: const LinearGradient(
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Icon(icon, color: Colors.white, size: 21),
    );
  }
}
