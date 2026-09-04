/**
 * Comment Service Tests (Module 5)
 * ================================
 * Tests for comment CRUD: create, getByPost, delete.
 * Covers authorization, validation, count updates, and reply handling.
 *
 * Run with: npm test -- --testPathPatterns=comment.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockCommentIdCounter = 1;
const mockComments = [];

jest.mock('../../src/models/comment.model', () => {
  const MockComment = function (data) {
    Object.assign(this, data);
    this._id = data._id || `comment_${mockCommentIdCounter++}`;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
    this.deleteOne = jest.fn().mockImplementation(function () {
      const idx = mockComments.findIndex((c) => c._id === this._id);
      if (idx !== -1) mockComments.splice(idx, 1);
      return Promise.resolve({ deletedCount: 1 });
    });
  };

  MockComment.create = jest.fn().mockImplementation((data) => {
    const doc = new MockComment(data);
    mockComments.push(doc);
    return Promise.resolve(doc);
  });

  /**
   * Mock find that supports chaining: populate, sort, skip, limit.
   * Applies skip/limit before resolving.
   */
  MockComment.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockComments];

    // Filter by post
    if (filter.post) {
      results = results.filter((c) => c.post === filter.post);
    }

    // Filter by parentComment
    if (filter.parentComment !== undefined && filter.parentComment !== null) {
      if (typeof filter.parentComment === 'object' && filter.parentComment.$in) {
        // parentComment: { $in: [...] }
        const ids = filter.parentComment.$in.map((id) => id.toString());
        results = results.filter((c) => c.parentComment && ids.includes(c.parentComment.toString()));
      } else {
        // parentComment: specific value (string)
        results = results.filter((c) => c.parentComment === filter.parentComment);
      }
    } else if (filter.parentComment === null) {
      results = results.filter((c) => c.parentComment === null || c.parentComment === undefined);
    }

    // Build chain with real skip/limit support
    let _skip = 0;
    let _limit = results.length;

    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockImplementation((n) => { _skip = n; return chain; });
    chain.limit = jest.fn().mockImplementation((n) => { _limit = n; return chain; });
    chain.then = (resolve, reject) => {
      const sliced = results.slice(_skip, _skip + _limit);
      return Promise.resolve(sliced).then(resolve, reject);
    };
    chain.catch = (fn) => {
      const sliced = results.slice(_skip, _skip + _limit);
      return Promise.resolve(sliced).catch(fn);
    };
    return chain;
  });

  MockComment.findById = jest.fn().mockImplementation((id) => {
    const found = mockComments.find((c) => c._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
    return chain;
  });

  /**
   * Mock countDocuments that properly handles parentComment filtering.
   */
  MockComment.countDocuments = jest.fn().mockImplementation((filter) => {
    let results = [...mockComments];

    if (filter.post) {
      results = results.filter((c) => c.post === filter.post);
    }

    if (filter.parentComment !== undefined && filter.parentComment !== null) {
      if (filter.parentComment === null) {
        results = results.filter((c) => c.parentComment === null || c.parentComment === undefined);
      } else {
        // parentComment: specific value (string ID)
        results = results.filter((c) => c.parentComment === filter.parentComment);
      }
    }

    return Promise.resolve(results.length);
  });

  /**
   * Mock deleteMany — removes matching comments and returns count.
   */
  MockComment.deleteMany = jest.fn().mockImplementation((filter) => {
    let deletedCount = 0;
    if (filter.parentComment !== undefined) {
      const toRemove = mockComments.filter((c) => c.parentComment === filter.parentComment);
      deletedCount = toRemove.length;
      for (const c of toRemove) {
        const idx = mockComments.indexOf(c);
        if (idx !== -1) mockComments.splice(idx, 1);
      }
    }
    return Promise.resolve({ deletedCount });
  });

  MockComment.deleteOne = jest.fn().mockImplementation(function (filter) {
    const idx = mockComments.findIndex((c) => c._id === filter._id);
    if (idx !== -1) {
      mockComments.splice(idx, 1);
      return Promise.resolve({ deletedCount: 1 });
    }
    return Promise.resolve({ deletedCount: 0 });
  });

  MockComment._reset = () => {
    mockComments.length = 0;
    mockCommentIdCounter = 1;
  };

  MockComment._add = (data) => {
    const doc = new MockComment(data);
    mockComments.push(doc);
    return doc;
  };

  return MockComment;
});

let mockPostIdCounter = 1;
const mockPosts = [];

jest.mock('../../src/models/post.model', () => {
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${mockPostIdCounter++}`;
    this.commentsCount = data.commentsCount || 0;
    this.save = jest.fn().mockImplementation(function () {
      return Promise.resolve(this);
    });
    this.populate = jest.fn().mockReturnValue(this);
    this.toObject = jest.fn().mockImplementation(function () {
      return { ...this };
    });
  };

  MockPost.findById = jest.fn().mockImplementation((id) => {
    const found = mockPosts.find((p) => p._id === id);
    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.select = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(found || null).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(found || null).catch(fn);
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

// Block service is lazily required inside comment.service — mock it so the
// real Block model (ObjectId-cast) never sees fake test ids.
jest.mock('../../src/services/block.service', () => ({
  hasAnyBlock: jest.fn().mockResolvedValue(false),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const Comment = require('../../src/models/comment.model');
const Post = require('../../src/models/post.model');
const commentService = require('../../src/services/comment.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Comment Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Comment._reset();
    Post._reset();
  });

  // ─── Create ───────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a comment and increment post commentsCount', async () => {
      const post = Post._add({ _id: 'p1', commentsCount: 0 });
      const result = await commentService.create('p1', 'u1', 'Great post!');

      expect(result).toBeDefined();
      expect(result.text).toBe('Great post!');
      expect(result.post).toBe('p1');
      expect(result.user).toBe('u1');
      expect(Comment.create).toHaveBeenCalled();
      expect(post.commentsCount).toBe(1);
      expect(post.save).toHaveBeenCalled();
    });

    it('should increment from existing comment count', async () => {
      const post = Post._add({ _id: 'p2', commentsCount: 5 });
      await commentService.create('p2', 'u1', 'Another comment');

      expect(post.commentsCount).toBe(6);
    });

    it('should create a reply with parentCommentId', async () => {
      const post = Post._add({ _id: 'p3', commentsCount: 1 });
      Comment._add({
        _id: 'c_parent',
        post: 'p3',
        user: 'u1',
        text: 'Parent comment',
        parentComment: null,
      });

      const result = await commentService.create('p3', 'u2', 'Reply text', 'c_parent');

      expect(result).toBeDefined();
      expect(result.text).toBe('Reply text');
      expect(result.parentComment).toBe('c_parent');
      expect(post.commentsCount).toBe(2);
    });

    it('should trim whitespace from comment text', async () => {
      Post._add({ _id: 'p4', commentsCount: 0 });
      const result = await commentService.create('p4', 'u1', '  Trimmed comment  ');

      expect(result.text).toBe('Trimmed comment');
    });

    it('should throw if post does not exist', async () => {
      await expect(commentService.create('nonexistent', 'u1', 'Text')).rejects.toThrow(
        'Post not found'
      );
    });

    it('should throw if text is empty', async () => {
      Post._add({ _id: 'p5', commentsCount: 0 });
      await expect(commentService.create('p5', 'u1', '')).rejects.toThrow(
        'Comment text is required'
      );
    });

    it('should throw if text is whitespace only', async () => {
      Post._add({ _id: 'p6', commentsCount: 0 });
      await expect(commentService.create('p6', 'u1', '   ')).rejects.toThrow(
        'Comment text is required'
      );
    });

    it('should throw if text is null', async () => {
      Post._add({ _id: 'p7', commentsCount: 0 });
      await expect(commentService.create('p7', 'u1', null)).rejects.toThrow(
        'Comment text is required'
      );
    });

    it('should throw if text is undefined', async () => {
      Post._add({ _id: 'p8', commentsCount: 0 });
      await expect(commentService.create('p8', 'u1', undefined)).rejects.toThrow(
        'Comment text is required'
      );
    });
  });

  // ─── getByPost ────────────────────────────────────────────────────

  describe('getByPost', () => {
    it('should return paginated comments for a post', async () => {
      Comment._add({ _id: 'c1', post: 'p1', user: 'u1', text: 'Comment 1', parentComment: null });
      Comment._add({ _id: 'c2', post: 'p1', user: 'u2', text: 'Comment 2', parentComment: null });

      const result = await commentService.getByPost('p1', 1, 10);

      expect(result.comments).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(10);
    });

    it('should return empty array for post with no comments', async () => {
      const result = await commentService.getByPost('empty_post', 1, 10);

      expect(result.comments).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should include replies nested under parent comments', async () => {
      Comment._add({ _id: 'c_parent', post: 'p2', user: 'u1', text: 'Parent', parentComment: null });
      Comment._add({ _id: 'c_reply', post: 'p2', user: 'u2', text: 'Reply', parentComment: 'c_parent' });

      const result = await commentService.getByPost('p2', 1, 10);

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0].replies).toBeDefined();
      expect(result.comments[0].replies).toHaveLength(1);
      expect(result.comments[0].replies[0].text).toBe('Reply');
    });

    it('should handle pagination correctly', async () => {
      for (let i = 0; i < 15; i++) {
        Comment._add({ _id: `c${i}`, post: 'p3', user: 'u1', text: `Comment ${i}`, parentComment: null });
      }

      const page1 = await commentService.getByPost('p3', 1, 5);
      expect(page1.comments).toHaveLength(5);
      expect(page1.pagination.total).toBe(15);
      expect(page1.pagination.pages).toBe(3);

      const page2 = await commentService.getByPost('p3', 2, 5);
      expect(page2.comments).toHaveLength(5);

      const page3 = await commentService.getByPost('p3', 3, 5);
      expect(page3.comments).toHaveLength(5);
    });

    it('should return empty for page beyond total', async () => {
      for (let i = 0; i < 3; i++) {
        Comment._add({ _id: `c_page_${i}`, post: 'p4', user: 'u1', text: `Comment ${i}`, parentComment: null });
      }

      const result = await commentService.getByPost('p4', 10, 5);
      expect(result.comments).toHaveLength(0);
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a comment by owner', async () => {
      const post = Post._add({ _id: 'p_del1', commentsCount: 3 });
      Comment._add({ _id: 'c_del1', post: 'p_del1', user: 'owner_1', text: 'My comment', parentComment: null });

      const result = await commentService.delete('c_del1', 'owner_1');

      expect(result.message).toBe('Comment deleted successfully');
      // repliesCount should be 0 (no replies), totalDeleted = 1
      expect(post.commentsCount).toBe(2);
    });

    it('should allow MODERATOR to delete any comment', async () => {
      const post = Post._add({ _id: 'p_del2', commentsCount: 5 });
      Comment._add({ _id: 'c_del2', post: 'p_del2', user: 'someone_else', text: 'Their comment', parentComment: null });

      const result = await commentService.delete('c_del2', 'mod_1', 'MODERATOR');

      expect(result.message).toBe('Comment deleted successfully');
      expect(post.commentsCount).toBe(4);
    });

    it('should allow ADMIN to delete any comment', async () => {
      const post = Post._add({ _id: 'p_del3', commentsCount: 2 });
      Comment._add({ _id: 'c_del3', post: 'p_del3', user: 'someone_else', text: 'Admin target', parentComment: null });

      const result = await commentService.delete('c_del3', 'admin_1', 'ADMIN');

      expect(result.message).toBe('Comment deleted successfully');
      expect(post.commentsCount).toBe(1);
    });

    it('should reject delete by non-owner non-privileged user', async () => {
      Post._add({ _id: 'p_del4', commentsCount: 1 });
      Comment._add({ _id: 'c_del4', post: 'p_del4', user: 'owner_4', text: 'Protected', parentComment: null });

      await expect(commentService.delete('c_del4', 'random_user', 'USER')).rejects.toThrow(
        'Not authorized to delete this comment'
      );
    });

    it('should throw for non-existent comment', async () => {
      await expect(commentService.delete('ghost', 'user_1')).rejects.toThrow('Comment not found');
    });

    it('should delete replies and decrement count by total (parent + replies)', async () => {
      const post = Post._add({ _id: 'p_del5', commentsCount: 4 });
      Comment._add({ _id: 'c_parent_del', post: 'p_del5', user: 'u1', text: 'Parent', parentComment: null });
      Comment._add({ _id: 'c_reply_del', post: 'p_del5', user: 'u2', text: 'Reply 1', parentComment: 'c_parent_del' });
      Comment._add({ _id: 'c_reply_del2', post: 'p_del5', user: 'u3', text: 'Reply 2', parentComment: 'c_parent_del' });

      const result = await commentService.delete('c_parent_del', 'u1');

      expect(result.message).toBe('Comment deleted successfully');
      // totalDeleted = 1 (parent) + 2 (replies) = 3
      expect(post.commentsCount).toBe(1);
    });

    it('should not decrement below zero', async () => {
      const post = Post._add({ _id: 'p_del6', commentsCount: 1 });
      Comment._add({ _id: 'c_del6', post: 'p_del6', user: 'u1', text: 'Last one', parentComment: null });

      await commentService.delete('c_del6', 'u1');

      expect(post.commentsCount).toBe(0);
    });

    it('should handle post not found gracefully when updating count', async () => {
      Comment._add({ _id: 'c_no_post', post: 'ghost_post', user: 'u1', text: 'Orphan', parentComment: null });

      // Post.findById returns null — should not throw
      const result = await commentService.delete('c_no_post', 'u1');
      expect(result.message).toBe('Comment deleted successfully');
    });

    it('should only count direct replies, not nested replies of replies', async () => {
      const post = Post._add({ _id: 'p_del7', commentsCount: 4 });
      Comment._add({ _id: 'c_root', post: 'p_del7', user: 'u1', text: 'Root', parentComment: null });
      // Only direct reply — reply-to-reply is not counted via parentComment filter
      Comment._add({ _id: 'c_direct_reply', post: 'p_del7', user: 'u2', text: 'Direct', parentComment: 'c_root' });

      await commentService.delete('c_root', 'u1');

      // totalDeleted = 1 + 1 = 2
      expect(post.commentsCount).toBe(2);
    });
  });

  // ─── Validation ───────────────────────────────────────────────────

  describe('validation', () => {
    it('should reject empty comment text', async () => {
      Post._add({ _id: 'p_val1', commentsCount: 0 });
      await expect(commentService.create('p_val1', 'u1', '')).rejects.toThrow(
        'Comment text is required'
      );
    });

    it('should reject whitespace-only comment text', async () => {
      Post._add({ _id: 'p_val2', commentsCount: 0 });
      await expect(commentService.create('p_val2', 'u1', '   ')).rejects.toThrow(
        'Comment text is required'
      );
    });

    it('should reject invalid post ID', async () => {
      await expect(commentService.create('invalid_id', 'u1', 'Text')).rejects.toThrow(
        'Post not found'
      );
    });

    it('should reject deletion by unauthorized user', async () => {
      Post._add({ _id: 'p_val3', commentsCount: 1 });
      Comment._add({ _id: 'c_val3', post: 'p_val3', user: 'owner', text: 'Owned', parentComment: null });

      await expect(commentService.delete('c_val3', 'not_owner')).rejects.toThrow(
        'Not authorized'
      );
    });

    it('should accept valid comment text', async () => {
      Post._add({ _id: 'p_val4', commentsCount: 0 });
      const result = await commentService.create('p_val4', 'u1', 'Valid comment');
      expect(result.text).toBe('Valid comment');
    });

    it('should accept single character comment', async () => {
      Post._add({ _id: 'p_val5', commentsCount: 0 });
      const result = await commentService.create('p_val5', 'u1', 'X');
      expect(result.text).toBe('X');
    });
  });
});
