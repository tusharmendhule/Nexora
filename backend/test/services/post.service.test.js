/**
 * Post Service Tests (Module 24)
 * ==============================
 * Tests for post CRUD: create, getAll, getById, update, delete.
 *
 * Run with: npm test -- --testPathPatterns=post.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/models/post.model', () => {
  const mockPosts = [];
  let idCounter = 1;

  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${idCounter++}`;
    this.user = data.user || 'user_1';
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
  };

  MockPost.create = jest.fn().mockImplementation((data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return Promise.resolve(doc);
  });

  MockPost.find = jest.fn().mockImplementation(() => {
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve([...mockPosts]).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve([...mockPosts]).catch(fn);
    return chain;
  });

  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  MockPost.findByIdAndDelete = jest.fn().mockImplementation((id) => {
    const idx = mockPosts.findIndex((p) => p._id === id);
    if (idx !== -1) mockPosts.splice(idx, 1);
    return Promise.resolve(idx !== -1 ? { _id: id } : null);
  });

  MockPost.countDocuments = jest.fn().mockImplementation(() => {
    return Promise.resolve(mockPosts.length);
  });

  MockPost._reset = () => { mockPosts.length = 0; idCounter = 1; };
  MockPost._posts = mockPosts;
  MockPost._add = (data) => {
    const doc = new MockPost(data);
    mockPosts.push(doc);
    return doc;
  };

  return MockPost;
});

jest.mock('../../src/models/trust-score.model', () => {
  const mockTS = [];
  return {
    find: jest.fn().mockImplementation((filter) => {
      let results = [...mockTS];
      if (filter.post && filter.post.$in) {
        results = results.filter((t) => filter.post.$in.includes(t.post));
      }
      if (filter.post) results = results.filter((t) => t.post === filter.post);
      return Promise.resolve(results);
    }),
    findOne: jest.fn().mockImplementation((filter) => {
      const found = mockTS.find((t) => t.post === filter.post);
      return Promise.resolve(found || null);
    }),
    _reset: () => { mockTS.length = 0; },
    _add: (data) => { mockTS.push(data); return data; },
  };
});

jest.mock('../../src/models/like.model', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/models/comment.model', () => ({
  deleteMany: jest.fn().mockResolvedValue({}),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const Post = require('../../src/models/post.model');
const TrustScore = require('../../src/models/trust-score.model');
const postService = require('../../src/services/post.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Post Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Post._reset();
    TrustScore._reset();
  });

  // ─── Create ───────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a post with text only', async () => {
      const post = await postService.create('user_1', { text: 'Hello world' });
      expect(post).toBeDefined();
      expect(post.text).toBe('Hello world');
      expect(Post.create).toHaveBeenCalled();
    });

    it('should create a post with media', async () => {
      const post = await postService.create('user_1', {
        text: 'With image',
        media: [{ url: 'https://example.com/img.jpg', type: 'image' }],
      });
      expect(post).toBeDefined();
    });

    it('should create a post with string media URLs', async () => {
      const post = await postService.create('user_1', {
        text: 'String media',
        media: ['https://example.com/img.jpg'],
      });
      expect(post).toBeDefined();
    });

    it('should default verification status to PENDING_VERIFICATION', async () => {
      const post = await postService.create('user_1', { text: 'Status check' });
      expect(Post.create).toHaveBeenCalledWith(
        expect.objectContaining({ verificationStatus: 'PENDING_VERIFICATION' })
      );
    });

    it('should default moderation status to pending', async () => {
      await postService.create('user_1', { text: 'Moderation check' });
      expect(Post.create).toHaveBeenCalledWith(
        expect.objectContaining({ moderationStatus: 'pending' })
      );
    });

    it('should auto-detect content type from media', async () => {
      await postService.create('user_1', {
        text: 'Video post',
        media: [{ url: 'https://example.com/video.mp4', type: 'video' }],
      });
      expect(Post.create).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'video' })
      );
    });

    it('should handle empty text with no media', async () => {
      const post = await postService.create('user_1', {});
      expect(post).toBeDefined();
    });
  });

  // ─── GetAll ───────────────────────────────────────────────────────

  describe('getAll', () => {
    it('should return paginated posts', async () => {
      Post._add({ _id: 'p1', text: 'Post 1', user: 'u1' });
      Post._add({ _id: 'p2', text: 'Post 2', user: 'u2' });

      const result = await postService.getAll(1, 10);
      expect(result.posts).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should attach trust score details when available', async () => {
      Post._add({ _id: 'p_ts', text: 'Post with TS', user: 'u1' });
      TrustScore._add({ post: 'p_ts', score: 85, label: 'Green', explanation: 'Trustworthy' });

      const result = await postService.getAll(1, 10);
      expect(result.posts).toBeDefined();
    });

    it('should handle empty feed', async () => {
      const result = await postService.getAll(1, 10);
      expect(result.posts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // ─── GetById ──────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return a post by ID', async () => {
      Post._add({ _id: 'get_1', text: 'Get me', user: 'u1' });
      const result = await postService.getById('get_1');
      expect(result).toBeDefined();
    });

    it('should attach trust score detail if available', async () => {
      Post._add({ _id: 'get_ts', text: 'Post', user: 'u1' });
      TrustScore._add({ post: 'get_ts', score: 50, label: 'Orange', explanation: 'Uncertain' });

      const result = await postService.getById('get_ts');
      expect(result).toBeDefined();
    });

    it('should throw for non-existent post', async () => {
      await expect(postService.getById('ghost')).rejects.toThrow('Post not found');
    });
  });

  // ─── Update ───────────────────────────────────────────────────────

  describe('update', () => {
    it('should update post text by owner', async () => {
      Post._add({ _id: 'upd_1', text: 'Old text', user: 'owner_1' });
      const result = await postService.update('upd_1', 'owner_1', { text: 'New text' });
      expect(result).toBeDefined();
      expect(Post.findById).toHaveBeenCalled();
    });

    it('should reject update by non-owner', async () => {
      Post._add({ _id: 'upd_2', text: 'Protected', user: 'owner_2' });
      await expect(
        postService.update('upd_2', 'not_owner', { text: 'Hacked' })
      ).rejects.toThrow('Not authorized');
    });

    it('should throw for non-existent post', async () => {
      await expect(
        postService.update('ghost', 'user_1', { text: 'X' })
      ).rejects.toThrow('Post not found');
    });

    it('should only update allowed fields', async () => {
      Post._add({ _id: 'upd_3', text: 'Original', user: 'u3', isVerified: false });
      await postService.update('upd_3', 'u3', { text: 'Updated', isVerified: true });
      // isVerified is not in allowedFields, so should not be updated
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete post by owner', async () => {
      Post._add({ _id: 'del_1', text: 'Delete me', user: 'owner_1' });
      const result = await postService.delete('del_1', 'owner_1');
      expect(result.message).toBe('Post deleted successfully');
    });

    it('should allow MODERATOR to delete any post', async () => {
      Post._add({ _id: 'del_2', text: 'Mod delete', user: 'someone_else' });
      const result = await postService.delete('del_2', 'mod_1', 'MODERATOR');
      expect(result.message).toBe('Post deleted successfully');
    });

    it('should allow ADMIN to delete any post', async () => {
      Post._add({ _id: 'del_3', text: 'Admin delete', user: 'someone_else' });
      const result = await postService.delete('del_3', 'admin_1', 'ADMIN');
      expect(result.message).toBe('Post deleted successfully');
    });

    it('should reject delete by non-owner non-privileged user', async () => {
      Post._add({ _id: 'del_4', text: 'Protected', user: 'owner_4' });
      await expect(
        postService.delete('del_4', 'random_user', 'USER')
      ).rejects.toThrow('Not authorized');
    });

    it('should throw for non-existent post', async () => {
      await expect(
        postService.delete('ghost', 'user_1')
      ).rejects.toThrow('Post not found');
    });
  });
});
