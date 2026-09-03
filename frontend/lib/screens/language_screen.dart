import 'package:flutter/material.dart';

import '../services/settings_service.dart';

class LanguageScreen extends StatefulWidget {
  const LanguageScreen({super.key});

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> {
  final SettingsService _settingsService = SettingsService();

  String selectedLanguage = 'English';
  String searchQuery = '';
  bool _isLoading = true;

  final List<Map<String, String>> languages = const [
    {'name': 'English', 'native': 'English'},
    {'name': 'Hindi', 'native': 'हिन्दी'},
    {'name': 'Bengali', 'native': 'বাংলা'},
    {'name': 'Punjabi', 'native': 'ਪੰਜਾਬੀ'},
    {'name': 'German', 'native': 'Deutsch'},
    {'name': 'Italian', 'native': 'Italiano'},
    {'name': 'Portuguese', 'native': 'Português'},
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
        selectedLanguage = settings['language'] ?? 'English';
        _isLoading = false;
      });
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveLanguage(String language) async {
    await _settingsService.updateSettings({
      'language': language,
    });
  }

  List<Map<String, String>> get filteredLanguages {
    if (searchQuery.trim().isEmpty) {
      return languages;
    }

    final query = searchQuery.toLowerCase();

    return languages.where((language) {
      return language['name']!.toLowerCase().contains(query) ||
          language['native']!.toLowerCase().contains(query);
    }).toList();
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
          'Language',
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
          : Column(
              children: [
                _currentLanguageCard(),

                _searchBar(),

                Expanded(
                  child: filteredLanguages.isEmpty
                      ? _noResults()
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(18, 6, 18, 30),
                          itemCount: filteredLanguages.length,
                          itemBuilder: (context, index) {
                            final language = filteredLanguages[index];

                            return _languageTile(
                              name: language['name']!,
                              nativeName: language['native']!,
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }

  Widget _currentLanguageCard() {
    return Container(
      margin: const EdgeInsets.fromLTRB(18, 10, 18, 18),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.14),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: Colors.white.withOpacity(0.14)),
            ),
            child: const Icon(
              Icons.language_rounded,
              color: Colors.white,
              size: 25,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'App Language',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 4),
                Text(
                  selectedLanguage,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.check_circle, color: Colors.white, size: 22),
        ],
      ),
    );
  }

  Widget _searchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF171D35),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: Colors.white.withOpacity(0.06)),
        ),
        child: TextField(
          onChanged: (value) {
            setState(() {
              searchQuery = value;
            });
          },
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Search languages',
            hintStyle: const TextStyle(color: Colors.white38, fontSize: 14),
            prefixIcon: const Icon(Icons.search, color: Colors.white54),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 15),
          ),
        ),
      ),
    );
  }

  Widget _languageTile({required String name, required String nativeName}) {
    final selected = selectedLanguage == name;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFF1C2342) : const Color(0xFF171D35),
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: selected
              ? const Color(0xFF6D63E8).withOpacity(0.55)
              : Colors.white.withOpacity(0.05),
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            gradient: const LinearGradient(
              colors: [Color(0xFF3157D5), Color(0xFF7C3AED)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: const Icon(
            Icons.translate_rounded,
            color: Colors.white,
            size: 20,
          ),
        ),
        title: Text(
          name,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            nativeName,
            style: const TextStyle(color: Colors.white54, fontSize: 12),
          ),
        ),
        trailing: selected
            ? const Icon(Icons.check_circle, color: Color(0xFF8B7CFF), size: 21)
            : const Icon(
                Icons.radio_button_unchecked,
                color: Colors.white24,
                size: 21,
              ),
        onTap: () {
          setState(() {
            selectedLanguage = name;
          });
          _saveLanguage(name);

          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$name selected'),
              duration: const Duration(milliseconds: 900),
              behavior: SnackBarBehavior.floating,
              backgroundColor: const Color(0xFF171D35),
            ),
          );
        },
      ),
    );
  }

  Widget _noResults() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.language_outlined,
              color: Colors.white30,
              size: 42,
            ),
            const SizedBox(height: 14),
            const Text(
              'No languages found',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Try searching for another language.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withOpacity(0.35),
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
