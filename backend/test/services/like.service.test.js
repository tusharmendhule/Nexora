/**
 * Like Service Tests (Module 4)
 * ===============================
 * Tests for like/unlike: toggle, duplicate prevention,
 * post validation, correct counts, authorization.
 *
 * Run with: npm test -- --testPathPatterns=like.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockLikeIdCounter = 1;
const mockLikes = [];

jest.mock('../../src/models/like.model', () => {
  const MockLike = function (data) {
    Object.assign(this, data);
    this._id = data._id || `like_${mockLikeIdCounter++}`;
  };

  MockLike.findOne = jest.fn().mockImplementation((filter) => {
    const found = mockLikes.find(
      (l) =>
        l.post.toString() === filter.post.toString() &&
        l.user.toString() === filter.user.toString()
    );
    return Promise.resolve(found || null);
  });

  MockLike.create = jest.fn().mockImplementation((data) => {
    const doc = new MockLike(data);
    mockLikes.push(doc);
    return Promise.resolve(doc);
  });

  MockLike.deleteOne = jest.fn().mockImplementation(function () {
    const idx = mockLikes.findIndex((l) => l._id === this._id);
    if (idx !== -1) mockLikes.splice(idx, 1);
    return Promise.resolve({ deletedCount: 1 });
  });

  MockLike.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockLikes];
    if (filter.post && typeof filter.post === 'object' && filter.post.$in) {
      const ids = filter.post.$in.map((id) => id.toString());
      results = results.filter((l) => ids.includes(l.post.toString()));
    }
    if (filter.user) {
      results = results.filter((l) => l.user.toString() === filter.user.toString());
    }
    return {
      select: jest.fn().mockReturnValue({
        then: (resolve) => resolve(results),
      }),
    };
  });

  MockLike._reset = () => {
    mockLikes.length = 0;
    mockLikeIdCounter = 1;
  };

  return MockLike;
});

let mockPostIdCounter = 1;
const mockPosts = [];

jest.mock('../../src/models/post.model', () => {
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${mockPostIdCounter++}`;
    this.likesCount = data.likesCount || 0;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
  };

  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    // Return a chainable object so .select() works
    const chain = {
      select: jest.fn().mockReturnValue(Promise.resolve(found)),
      then: (resolve, reject) => Promise.resolve(found).then(resolve, reject),
    };
    return chain;
  });

  MockPost._reset = () => {
    mockPosts.length = 0;
    mockPostIdCounter = 1;
  };

  MockPost._add = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };

  return MockPost;
});

// Block service is lazily required inside like.service — mock it so the
// real Block model (ObjectId-cast) never sees fake test ids.
jest.mock('../../src/services/block.service', () => ({
  hasAnyBlock: jest.fn().mockResolvedValue(false),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const Like = require('../../src/models/like.model');
const Post = require('../../src/models/post.model');
const likeService = require('../../src/services/like.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Like Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Like._reset();
    Post._reset();
  });

  // ─── toggle (like) ──────────────────────────────────────────────────

  describe('toggle — like a post', () => {
    it('should create a like and increment likesCount', async () => {
      const post = Post._add({ _id: 'p1', likesCount: 0 });
      const result = await likeService.toggle('p1', 'u1');

      expect(result.isLiked).toBe(true);
      expect(result.likesCount).toBe(1);
      expect(post.likesCount).toBe(1);
      expect(post.save).toHaveBeenCalled();
      expect(Like.create).toHaveBeenCalledWith({ post: 'p1', user: 'u1' });
    });

    it('should increment from existing count', async () => {
      const post = Post._add({ _id: 'p2', likesCount: 5 });
      const result = await likeService.toggle('p2', 'u1');

      expect(result.isLiked).toBe(true);
      expect(result.likesCount).toBe(6);
    });
  });

  // ─── toggle (unlike) ────────────────────────────────────────────────

  describe('toggle — unlike a post', () => {
    it('should remove a like and decrement likesCount', async () => {
      const post = Post._add({ _id: 'p3', likesCount: 3 });
      // Pre-populate a like
      await Like.create({ post: 'p3', user: 'u1' });

      const result = await likeService.toggle('p3', 'u1');

      expect(result.isLiked).toBe(false);
      expect(result.likesCount).toBe(2);
      expect(post.likesCount).toBe(2);
    });

    it('should not decrement below zero', async () => {
      const post = Post._add({ _id: 'p4', likesCount: 0 });
      await Like.create({ post: 'p4', user: 'u1' });

      const result = await likeService.toggle('p4', 'u1');

      expect(result.isLiked).toBe(false);
      expect(result.likesCount).toBe(0);
    });
  });

  // ─── duplicate prevention ───────────────────────────────────────────

  describe('duplicate prevention', () => {
    it('should not create duplicate likes (unique index)', async () => {
      const post = Post._add({ _id: 'p5', likesCount: 0 });

      // First like
      await likeService.toggle('p5', 'u1');
      expect(post.likesCount).toBe(1);

      // Second toggle should unlike
      const result = await likeService.toggle('p5', 'u1');
      expect(result.isLiked).toBe(false);
      expect(result.likesCount).toBe(0);
    });
  });

  // ─── post validation ────────────────────────────────────────────────

  describe('post validation', () => {
    it('should throw if post does not exist', async () => {
      await expect(likeService.toggle('nonexistent', 'u1')).rejects.toThrow(
        'Post not found'
      );
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should remove a like and return correct count', async () => {
      const post = Post._add({ _id: 'p6', likesCount: 2 });
      await Like.create({ post: 'p6', user: 'u1' });

      const result = await likeService.remove('p6', 'u1');

      expect(result.isLiked).toBe(false);
      expect(result.likesCount).toBe(1);
    });

    it('should throw if like does not exist', async () => {
      Post._add({ _id: 'p7', likesCount: 0 });
      await expect(likeService.remove('p7', 'u1')).rejects.toThrow(
        'Like not found'
      );
    });
  });

  // ─── hasLiked ───────────────────────────────────────────────────────

  describe('hasLiked', () => {
    it('should return true if user has liked the post', async () => {
      Post._add({ _id: 'p8', likesCount: 1 });
      await Like.create({ post: 'p8', user: 'u1' });

      const result = await likeService.hasLiked('p8', 'u1');
      expect(result).toBe(true);
    });

    it('should return false if user has not liked the post', async () => {
      Post._add({ _id: 'p9', likesCount: 0 });

      const result = await likeService.hasLiked('p9', 'u1');
      expect(result).toBe(false);
    });
  });

  // ─── getCount ───────────────────────────────────────────────────────

  describe('getCount', () => {
    it('should return the like count for a post', async () => {
      Post._add({ _id: 'p10', likesCount: 42 });

      const count = await likeService.getCount('p10');
      expect(count).toBe(42);
    });

    it('should return 0 for non-existent post', async () => {
      const count = await likeService.getCount('nonexistent');
      expect(count).toBe(0);
    });
  });
});
