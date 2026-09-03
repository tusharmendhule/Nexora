/**
 * Post Search Service Tests (Module 8)
 * =====================================
 * Tests for post search: text search, hashtag search, tag search,
 * empty queries, pagination, and authorization.
 *
 * Run with: npm test -- --testPathPatterns=post-search.service
 */

// ─── Mocks ────────────────────────────────────────────────────────────

let mockPostIdCounter = 1;
const mockPosts = [];

jest.mock('../../src/models/post.model', () => {
  const MockPost = function (data) {
    Object.assign(this, data);
    this._id = data._id || `post_${mockPostIdCounter++}`;
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

  MockPost.find = jest.fn().mockImplementation((filter) => {
    let results = [...mockPosts];

    // Filter by $or (text search)
    if (filter.$or) {
      results = results.filter((p) => {
        return filter.$or.some((cond) => {
          if (cond.text && cond.text.$regex) {
            const regex = new RegExp(cond.text.$regex, cond.text.$options || '');
            return regex.test(p.text || '');
          }
          if (cond.hashtags && cond.hashtags.$regex) {
            const regex = new RegExp(cond.hashtags.$regex, cond.hashtags.$options || '');
            return (p.hashtags || []).some((h) => regex.test(h));
          }
          if (cond.tags && cond.tags.$regex) {
            const regex = new RegExp(cond.tags.$regex, cond.tags.$options || '');
            return (p.tags || []).some((t) => regex.test(t));
          }
          return false;
        });
      });
    }

    // Filter by visibility
    if (filter.visibility) {
      results = results.filter((p) => p.visibility === filter.visibility);
    }
    if (filter.isArchived !== undefined) {
      results = results.filter((p) => p.isArchived === filter.isArchived);
    }

    const chain = {};
    chain.populate = jest.fn().mockReturnValue(chain);
    chain.sort = jest.fn().mockReturnValue(chain);
    chain.skip = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.then = (resolve, reject) => Promise.resolve(results).then(resolve, reject);
    chain.catch = (fn) => Promise.resolve(results).catch(fn);
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

  MockPost.countDocuments = jest.fn().mockImplementation((filter) => {
    let results = [...mockPosts];
    if (filter.$or) {
      results = results.filter((p) => {
        return filter.$or.some((cond) => {
          if (cond.text && cond.text.$regex) {
            const regex = new RegExp(cond.text.$regex, cond.text.$options || '');
            return regex.test(p.text || '');
          }
          if (cond.hashtags && cond.hashtags.$regex) {
            const regex = new RegExp(cond.hashtags.$regex, cond.hashtags.$options || '');
            return (p.hashtags || []).some((h) => regex.test(h));
          }
          if (cond.tags && cond.tags.$regex) {
            const regex = new RegExp(cond.tags.$regex, cond.tags.$options || '');
            return (p.tags || []).some((t) => regex.test(t));
          }
          return false;
        });
      });
    }
    if (filter.visibility) {
      results = results.filter((p) => p.visibility === filter.visibility);
    }
    return Promise.resolve(results.length);
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

jest.mock('../../src/models/trust-score.model', () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/models/like.model', () => ({
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockResolvedValue([]),
  }),
}));

// ─── Imports ──────────────────────────────────────────────────────────

const Post = require('../../src/models/post.model');
const postService = require('../../src/services/post.service');

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('Post Search Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Post._reset();

    // Add some test posts
    Post._add({
      _id: 'p1',
      text: 'Hello world, this is a technology post',
      hashtags: ['technology', 'coding'],
      tags: ['tech', 'programming'],
      visibility: 'public',
      isArchived: false,
      user: 'u1',
    });
    Post._add({
      _id: 'p2',
      text: 'Gaming is fun! Let us play some games',
      hashtags: ['gaming', 'fun'],
      tags: ['games', 'entertainment'],
      visibility: 'public',
      isArchived: false,
      user: 'u2',
    });
    Post._add({
      _id: 'p3',
      text: 'Music and art are beautiful',
      hashtags: ['music', 'art'],
      tags: ['creative', 'culture'],
      visibility: 'public',
      isArchived: false,
      user: 'u3',
    });
    Post._add({
      _id: 'p4',
      text: 'Private post that should not appear',
      hashtags: ['private'],
      tags: ['hidden'],
      visibility: 'private',
      isArchived: false,
      user: 'u4',
    });
    Post._add({
      _id: 'p5',
      text: 'Archived post about technology',
      hashtags: ['technology'],
      tags: ['old'],
      visibility: 'public',
      isArchived: true,
      user: 'u5',
    });
  });

  // ─── Text Search ─────────────────────────────────────────────────

  describe('Text Search', () => {
    it('should search posts by text content', async () => {
      const result = await postService.search('technology');

      expect(result.posts).toBeDefined();
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      // Should find p1 (has "technology" in text) but not p5 (archived)
      expect(result.posts.some((p) => p._id === 'p1')).toBe(true);
    });

    it('should search posts case-insensitively', async () => {
      const result = await postService.search('GAMING');

      expect(result.posts).toBeDefined();
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      expect(result.posts.some((p) => p._id === 'p2')).toBe(true);
    });

    it('should return empty for no matches', async () => {
      const result = await postService.search('xyznonexistent');

      expect(result.posts).toBeDefined();
      expect(result.posts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // ─── Hashtag Search ──────────────────────────────────────────────

  describe('Hashtag Search', () => {
    it('should search posts by hashtags', async () => {
      const result = await postService.search('music');

      expect(result.posts).toBeDefined();
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      expect(result.posts.some((p) => p._id === 'p3')).toBe(true);
    });
  });

  // ─── Tag Search ──────────────────────────────────────────────────

  describe('Tag Search', () => {
    it('should search posts by tags', async () => {
      const result = await postService.search('creative');

      expect(result.posts).toBeDefined();
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      expect(result.posts.some((p) => p._id === 'p3')).toBe(true);
    });
  });

  // ─── Empty Queries ───────────────────────────────────────────────

  describe('Empty Queries', () => {
    it('should return empty for null query', async () => {
      const result = await postService.search(null);

      expect(result.posts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should return empty for empty string query', async () => {
      const result = await postService.search('');

      expect(result.posts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should return empty for whitespace-only query', async () => {
      const result = await postService.search('   ');

      expect(result.posts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });

  // ─── Filtering ───────────────────────────────────────────────────

  describe('Filtering', () => {
    it('should not return private posts', async () => {
      const result = await postService.search('private');

      // The private post (p4) should not appear
      expect(result.posts.every((p) => p._id !== 'p4')).toBe(true);
    });

    it('should not return archived posts', async () => {
      const result = await postService.search('technology');

      // The archived post (p5) should not appear
      expect(result.posts.every((p) => p._id !== 'p5')).toBe(true);
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────

  describe('Pagination', () => {
    it('should support pagination', async () => {
      const result = await postService.search('technology', { page: 1, limit: 1 });

      expect(result.posts).toHaveLength(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(1);
    });

    it('should return correct pagination info', async () => {
      const result = await postService.search('technology');

      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBeDefined();
      expect(result.pagination.pages).toBeDefined();
    });
  });

  // ─── Escape Regex ────────────────────────────────────────────────

  describe('Regex Safety', () => {
    it('should handle special regex characters in query', async () => {
      // Should not throw when given special characters
      const result = await postService.search('test.*($or)');
      expect(result).toBeDefined();
      expect(result.posts).toBeDefined();
    });

    it('should handle single character query', async () => {
      const result = await postService.search('a');
      expect(result).toBeDefined();
      expect(result.posts).toBeDefined();
    });
  });

  // ─── Default Options ─────────────────────────────────────────────

  describe('Default Options', () => {
    it('should use default page and limit', async () => {
      const result = await postService.search('technology');

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should respect custom page and limit', async () => {
      const result = await postService.search('technology', { page: 2, limit: 5 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(5);
    });
  });
});
