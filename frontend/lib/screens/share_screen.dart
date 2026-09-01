import 'package:flutter/material.dart';

class ShareScreen extends StatefulWidget {
  final String username;

  const ShareScreen({super.key, required this.username});

  @override
  State<ShareScreen> createState() => _ShareScreenState();
}

class _ShareScreenState extends State<ShareScreen> {
  final TextEditingController _searchController = TextEditingController();
  final Set<String> selectedUsers = {};

  final List<String> people = ['Aarav', 'Maya', 'Arjun', 'Ananya', 'Riya'];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<String> get filteredPeople {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return people;
    return people
        .where((person) => person.toLowerCase().contains(query))
        .toList();
  }

  void _toggleUser(String username) {
    setState(() {
      if (selectedUsers.contains(username)) {
        selectedUsers.remove(username);
      } else {
        selectedUsers.add(username);
      }
    });
  }

  void _send() {
    if (selectedUsers.isEmpty) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          selectedUsers.length == 1
              ? 'Sent to ${selectedUsers.first}'
              : 'Sent to ${selectedUsers.length} people',
        ),
      ),
    );

    setState(() {
      selectedUsers.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final peopleToShow = filteredPeople;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0B1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0B1A),
        elevation: 0,
        title: const Text(
          'Share',
          style: TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            child: TextField(
              controller: _searchController,
              onChanged: (_) => setState(() {}),
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Search people',
                hintStyle: const TextStyle(color: Colors.white38),
                prefixIcon: const Icon(Icons.search, color: Colors.white54),
                filled: true,
                fillColor: const Color(0xFF171D35),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),

          const Padding(
            padding: EdgeInsets.fromLTRB(18, 0, 18, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Send to',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),

          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: peopleToShow.length,
              itemBuilder: (context, index) {
                final person = peopleToShow[index];
                final selected = selectedUsers.contains(person);

                return GestureDetector(
                  onTap: () => _toggleUser(person),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: selected
                          ? const Color(0xFF20294A)
                          : const Color(0xFF171D35),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: selected
                            ? const Color(0xFF3157D5)
                            : Colors.transparent,
                      ),
                    ),
                    child: Row(
                      children: [
                        const CircleAvatar(
                          radius: 22,
                          backgroundColor: Color(0xFF6C63FF),
                          child: Icon(Icons.person, color: Colors.white),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            person,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Icon(
                          selected
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          color: selected
                              ? const Color(0xFF6C63FF)
                              : Colors.white38,
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
              child: Column(
                children: [
                  OutlinedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Link copied')),
                      );
                    },
                    icon: const Icon(Icons.link, color: Colors.white70),
                    label: const Text(
                      'Copy link',
                      style: TextStyle(color: Colors.white70),
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(double.infinity, 48),
                      side: BorderSide(color: Colors.white.withOpacity(0.12)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: selectedUsers.isEmpty ? null : _send,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF3157D5),
                        disabledBackgroundColor: const Color(0xFF20243A),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: Text(
                        selectedUsers.isEmpty
                            ? 'Select people'
                            : 'Send (${selectedUsers.length})',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
