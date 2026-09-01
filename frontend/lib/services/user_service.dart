import 'package:shared_preferences/shared_preferences.dart';

import '../models/user.dart';

class UserService {
  final List<User> _users = [
    const User(
      id: 'user_you',
      username: 'Username_',
      displayName: 'Username_',
      bio: 'Building, creating and exploring the world.',
      followersCount: 2400,
      followingCount: 386,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: true,
    ),

    const User(
      id: 'aarav',
      username: 'Aarav',
      displayName: 'Aarav',
      bio: 'Building, creating and exploring the world.',
      followersCount: 1800,
      followingCount: 240,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: true,
    ),

    const User(
      id: 'maya',
      username: 'Maya',
      displayName: 'Maya',
      bio: 'Creating things that feel like me. 💜',
      followersCount: 3200,
      followingCount: 410,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: true,
    ),

    const User(
      id: 'arjun',
      username: 'Arjun',
      displayName: 'Arjun',
      bio: 'Late nights. Big ideas. 🚀',
      followersCount: 1450,
      followingCount: 198,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: false,
    ),

    const User(
      id: 'ananya',
      username: 'Ananya',
      displayName: 'Ananya',
      bio: 'Finding beauty in the ordinary. 🌿',
      followersCount: 2700,
      followingCount: 350,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: true,
    ),

    const User(
      id: 'riya',
      username: 'Riya',
      displayName: 'Riya',
      bio: 'Sharing ideas and exploring new perspectives.',
      followersCount: 980,
      followingCount: 175,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: false,
    ),

    const User(
      id: 'user1',
      username: 'User1',
      displayName: 'User1',
      bio: 'Building, creating and exploring the world.',
      followersCount: 128,
      followingCount: 86,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: false,
    ),

    const User(
      id: 'user2',
      username: 'User2',
      displayName: 'User2',
      bio: 'Building, creating and exploring the world.',
      followersCount: 420,
      followingCount: 120,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: false,
    ),

    const User(
      id: 'user3',
      username: 'User3',
      displayName: 'User3',
      bio: 'Building, creating and exploring the world.',
      followersCount: 310,
      followingCount: 94,
      isFollowing: false,
      isFollowedBy: false,
      isVerified: false,
    ),
  ];

  List<User> get users => List.unmodifiable(_users);

  Future<List<User>> fetchUsers() async {
    return List.unmodifiable(_users);
  }

  Future<User?> getUserById(String userId) async {
    for (final user in _users) {
      if (user.id == userId) {
        return user;
      }
    }

    return null;
  }

  Future<User?> getUserByUsername(String username) async {
    final prefs = await SharedPreferences.getInstance();

    final savedUsername = prefs.getString('profile_username');
    final savedDisplayName = prefs.getString('profile_display_name');
    final savedBio = prefs.getString('profile_bio');
    final savedImagePath = prefs.getString('profile_image_path');

    for (final user in _users) {
      if (user.username.toLowerCase() == username.toLowerCase() ||
          user.id == 'user_you') {
        if (user.id == 'user_you' && savedUsername != null) {
          return User(
            id: user.id,
            username: savedUsername,
            displayName: savedDisplayName?.isNotEmpty == true
                ? savedDisplayName
                : user.displayName,
            bio: savedBio?.isNotEmpty == true ? savedBio : user.bio,
            profileImageUrl: savedImagePath,
            followersCount: user.followersCount,
            followingCount: user.followingCount,
            isFollowing: user.isFollowing,
            isFollowedBy: user.isFollowedBy,
            isVerified: user.isVerified,
          );
        }

        return user;
      }
    }

    return null;
  }

  Future<List<User>> searchUsers(String query) async {
    final searchQuery = query.trim().toLowerCase();

    if (searchQuery.isEmpty) {
      return List.unmodifiable(_users);
    }

    return _users.where((user) {
      final username = user.username.toLowerCase();
      final displayName = user.displayName?.toLowerCase() ?? '';

      return username.contains(searchQuery) ||
          displayName.contains(searchQuery);
    }).toList();
  }

  Future<void> createUser(User user) async {
    _users.add(user);
  }

  Future<void> updateUser(User updatedUser) async {
    final index = _users.indexWhere((user) => user.id == updatedUser.id);

    if (index == -1) return;

    _users[index] = updatedUser;

    final prefs = await SharedPreferences.getInstance();

    await prefs.setString('profile_username', updatedUser.username);
    await prefs.setString(
      'profile_display_name',
      updatedUser.displayName ?? '',
    );
    await prefs.setString('profile_bio', updatedUser.bio ?? '');

    if (updatedUser.profileImageUrl != null) {
      await prefs.setString('profile_image_path', updatedUser.profileImageUrl!);
    } else {
      await prefs.remove('profile_image_path');
    }
  }

  Future<void> deleteUser(String userId) async {
    _users.removeWhere((user) => user.id == userId);
  }
}
