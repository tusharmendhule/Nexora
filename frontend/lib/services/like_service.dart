import '../models/like.dart';

class LikeService {
  final List<Like> _likes = [];

  Future<bool> isLiked({
    required String userId,
    required String contentId,
    required String contentType,
  }) async {
    return _likes.any(
      (like) =>
          like.userId == userId &&
          like.contentId == contentId &&
          like.contentType == contentType,
    );
  }

  Future<int> getLikeCount({
    required String contentId,
    required String contentType,
  }) async {
    return _likes
        .where(
          (like) =>
              like.contentId == contentId && like.contentType == contentType,
        )
        .length;
  }

  Future<void> like({
    required String userId,
    required String contentId,
    required String contentType,
  }) async {
    final alreadyLiked = await isLiked(
      userId: userId,
      contentId: contentId,
      contentType: contentType,
    );

    if (alreadyLiked) return;

    _likes.add(
      Like(
        id: '${userId}_${contentType}_$contentId',
        userId: userId,
        contentId: contentId,
        contentType: contentType,
        createdAt: DateTime.now(),
      ),
    );
  }

  Future<void> unlike({
    required String userId,
    required String contentId,
    required String contentType,
  }) async {
    _likes.removeWhere(
      (like) =>
          like.userId == userId &&
          like.contentId == contentId &&
          like.contentType == contentType,
    );
  }
}
