import 'package:flutter/material.dart';

import '../config/nexora_themes.dart';
import '../l10n/translations.dart';
import '../services/appearance_controller.dart';
import '../services/language_controller.dart';

class LanguageScreen extends StatefulWidget {
  const LanguageScreen({super.key});

  @override
  State<LanguageScreen> createState() => _LanguageScreenState();
}

class _LanguageScreenState extends State<LanguageScreen> {
  String searchQuery = '';

  @override
  void initState() {
    super.initState();
    // The controller is the single source of truth — it was loaded at
    // startup and persists every change to the backend + local cache.
    LanguageController.instance.addListener(_onLanguageChanged);
  }

  @override
  void dispose() {
    LanguageController.instance.removeListener(_onLanguageChanged);
    super.dispose();
  }

  void _onLanguageChanged() {
    if (mounted) setState(() {});
  }

  List<NexoraLanguage> get filteredLanguages {
    final query = searchQuery.trim().toLowerCase();
    if (query.isEmpty) return kSupportedLanguages;

    return kSupportedLanguages.where((language) {
      return language.name.toLowerCase().contains(query) ||
          language.native.toLowerCase().contains(query);
    }).toList();
  }

  Future<void> _selectLanguage(NexoraLanguage language) async {
    await LanguageController.instance.setLanguage(language.code);

    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(trP(context, '{0} selected', [language.name])),
        duration: const Duration(milliseconds: 900),
        behavior: SnackBarBehavior.floating,
        backgroundColor: context.nexora.card,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentCode = LanguageController.instance.languageCode;

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
          tr(context, 'Language'),
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      body: Column(
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
                        language: language,
                        selected: language.code == currentCode,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _currentLanguageCard() {
    final current = LanguageController.instance.language;

    return Container(
      margin: const EdgeInsets.fromLTRB(18, 10, 18, 18),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: LinearGradient(
          colors: nexoraGradient(),
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
              color: context.nexora.textPrimary.withOpacity(0.14),
              borderRadius: BorderRadius.circular(15),
              border: Border.all(color: context.nexora.textPrimary.withOpacity(0.14)),
            ),
            child: Icon(
              Icons.language_rounded,
              color: context.nexora.textPrimary,
              size: 25,
            ),
          ),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tr(context, 'App Language'),
                  style: TextStyle(color: context.nexora.textSecondary, fontSize: 12),
                ),
                SizedBox(height: 4),
                Text(
                  current.native,
                  style: TextStyle(
                    color: context.nexora.textPrimary,
                    fontSize: 19,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.check_circle, color: context.nexora.textPrimary, size: 22),
        ],
      ),
    );
  }

  Widget _searchBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
      child: Container(
        decoration: BoxDecoration(
          color: context.nexora.card,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: context.nexora.textPrimary.withOpacity(0.06)),
        ),
        child: TextField(
          onChanged: (value) {
            setState(() {
              searchQuery = value;
            });
          },
          style: TextStyle(color: context.nexora.textPrimary, fontSize: 14),
          decoration: InputDecoration(
            hintText: tr(context, 'Search languages'),
            hintStyle: TextStyle(color: context.nexora.textHint, fontSize: 14),
            prefixIcon: Icon(Icons.search, color: context.nexora.textMuted),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 15),
          ),
        ),
      ),
    );
  }

  Widget _languageTile({
    required NexoraLanguage language,
    required bool selected,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: selected ? context.nexora.surfaceSelected : context.nexora.card,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(
          color: selected
              ? const Color(0xFF6D63E8).withOpacity(0.55)
              : context.nexora.textPrimary.withOpacity(0.05),
        ),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(11),
            gradient: LinearGradient(
              colors: nexoraGradient(),
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Icon(
            Icons.translate_rounded,
            color: context.nexora.textPrimary,
            size: 20,
          ),
        ),
        title: Text(
          language.name,
          style: TextStyle(
            color: context.nexora.textPrimary,
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Text(
            language.native,
            style: TextStyle(color: context.nexora.textMuted, fontSize: 12),
          ),
        ),
        trailing: selected
            ? Icon(Icons.check_circle, color: Color(0xFF8B7CFF), size: 21)
            : Icon(
                Icons.radio_button_unchecked,
                color: context.nexora.textDim,
                size: 21,
              ),
        onTap: () => _selectLanguage(language),
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
            Icon(
              Icons.language_outlined,
              color: context.nexora.textHint,
              size: 42,
            ),
            SizedBox(height: 14),
            Text(
              tr(context, 'No languages found'),
              style: TextStyle(
                color: context.nexora.textSecondary,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            SizedBox(height: 6),
            Text(
              tr(context, 'Try searching for another language.'),
              textAlign: TextAlign.center,
              style: TextStyle(
                color: context.nexora.textPrimary.withOpacity(0.35),
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
