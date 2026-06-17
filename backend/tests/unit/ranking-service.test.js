const { calculatePostScore, rankPosts } = require('../../src/services/recommendation/rankingService');

describe('Ranking Service', () => {
  const defaultRankingConfig = {
    resonanceCountWeight: 3,
    commentCountWeight: 2,
    superEchoCountWeight: 5,
    tagMatchWeight: 4,
    recencyWeight: 1,
    hotDecayFactor: 1.2
  };

  const createMockPost = (overrides = {}) => ({
    _id: overrides._id || 'test-post-id',
    resonanceCount: overrides.resonanceCount || 0,
    commentCount: overrides.commentCount || 0,
    superEchoCount: overrides.superEchoCount || 0,
    tags: overrides.tags || [],
    createdAt: overrides.createdAt || new Date(),
    title: overrides.title || 'Test Post',
    contentText: overrides.contentText || 'Test content',
    author: overrides.author || 'author-id'
  });

  describe('calculatePostScore', () => {
    it('should calculate base score with interaction weights (recommend mode)', () => {
      const post = createMockPost({
        resonanceCount: 10,
        commentCount: 5,
        superEchoCount: 2
      });

      const score = calculatePostScore(post, 'recommend', [], defaultRankingConfig);

      const expectedBase = 10 * 3 + 5 * 2 + 2 * 5 + 1;
      expect(score).toBeGreaterThanOrEqual(expectedBase);
    });

    it('should return at least 1 even for a post with zero interactions', () => {
      const post = createMockPost({
        resonanceCount: 0,
        commentCount: 0,
        superEchoCount: 0,
        tags: []
      });

      const score = calculatePostScore(post, 'recommend', [], defaultRankingConfig);
      expect(score).toBeGreaterThanOrEqual(1);
    });

    it('should add bonus for matching preferred tags in recommend mode', () => {
      const post1 = createMockPost({ tags: ['音乐', '阅读'] });
      const post2 = createMockPost({ tags: ['旅行', '美食'] });

      const preferredTags = ['音乐', '阅读', '生活'];

      const score1 = calculatePostScore(post1, 'recommend', preferredTags, defaultRankingConfig);
      const score2 = calculatePostScore(post2, 'recommend', preferredTags, defaultRankingConfig);

      expect(score1).toBeGreaterThan(score2);
    });

    it('should add recency bonus for newer posts in recommend mode', () => {
      const oldPost = createMockPost({
        createdAt: new Date(Date.now() - 48 * 3600 * 1000)
      });
      const newPost = createMockPost({
        createdAt: new Date(Date.now() - 1 * 3600 * 1000)
      });

      const scoreOld = calculatePostScore(oldPost, 'recommend', [], defaultRankingConfig);
      const scoreNew = calculatePostScore(newPost, 'recommend', [], defaultRankingConfig);

      expect(scoreNew).toBeGreaterThan(scoreOld);
    });

    it('should apply time decay in hot mode', () => {
      const samePost = createMockPost({
        resonanceCount: 10,
        commentCount: 5,
        superEchoCount: 2,
        tags: ['热门']
      });

      const scoreNew = calculatePostScore(
        { ...samePost, createdAt: new Date(Date.now() - 2 * 3600 * 1000) },
        'hot',
        ['热门'],
        defaultRankingConfig
      );

      const scoreOld = calculatePostScore(
        { ...samePost, createdAt: new Date(Date.now() - 48 * 3600 * 1000) },
        'hot',
        ['热门'],
        defaultRankingConfig
      );

      expect(scoreNew).toBeGreaterThan(scoreOld);
    });

    it('should include tag match bonus in hot mode as additive factor', () => {
      const postWithoutTag = createMockPost({ tags: ['其他'] });
      const postWithTag = createMockPost({ tags: ['音乐'] });

      const scoreNoMatch = calculatePostScore(postWithoutTag, 'hot', ['音乐'], defaultRankingConfig);
      const scoreWithMatch = calculatePostScore(postWithTag, 'hot', ['音乐'], defaultRankingConfig);

      expect(scoreWithMatch).toBeGreaterThan(scoreNoMatch);
    });

    it('should handle negative or zero age gracefully', () => {
      const futurePost = createMockPost({
        createdAt: new Date(Date.now() + 1000 * 3600)
      });

      expect(() => {
        calculatePostScore(futurePost, 'recommend', [], defaultRankingConfig);
      }).not.toThrow();

      const score = calculatePostScore(futurePost, 'recommend', [], defaultRankingConfig);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('rankPosts', () => {
    it('should sort by score descending in recommend mode', () => {
      const lowScore = createMockPost({ _id: 'low', resonanceCount: 1 });
      const highScore = createMockPost({ _id: 'high', resonanceCount: 100, commentCount: 50, superEchoCount: 20 });
      const midScore = createMockPost({ _id: 'mid', resonanceCount: 10 });

      const posts = [lowScore, highScore, midScore];
      const ranked = rankPosts(posts, 'recommend', [], defaultRankingConfig);

      expect(ranked[0]._id).toBe('high');
      expect(ranked[1]._id).toBe('mid');
      expect(ranked[2]._id).toBe('low');
    });

    it('should sort by createdAt descending in latest mode', () => {
      const old = createMockPost({ _id: 'old', createdAt: new Date('2024-01-01') });
      const mid = createMockPost({ _id: 'mid', createdAt: new Date('2024-06-01') });
      const latest = createMockPost({ _id: 'latest', createdAt: new Date('2024-12-31') });

      const posts = [old, mid, latest];
      const ranked = rankPosts(posts, 'latest', [], defaultRankingConfig);

      expect(ranked[0]._id).toBe('latest');
      expect(ranked[1]._id).toBe('mid');
      expect(ranked[2]._id).toBe('old');
    });

    it('should use createdAt as tiebreaker when scores are equal', () => {
      const baseInteractions = { resonanceCount: 5, commentCount: 3, superEchoCount: 1 };
      const post1 = createMockPost({
        _id: 'p1',
        ...baseInteractions,
        createdAt: new Date('2024-01-15')
      });
      const post2 = createMockPost({
        _id: 'p2',
        ...baseInteractions,
        createdAt: new Date('2024-06-20')
      });

      const posts = [post1, post2];
      const ranked = rankPosts(posts, 'recommend', [], defaultRankingConfig);

      expect(ranked[0]._id).toBe('p2');
      expect(ranked[1]._id).toBe('p1');
    });

    it('should attach score property to each ranked post', () => {
      const posts = [
        createMockPost({ _id: 'a', resonanceCount: 5 }),
        createMockPost({ _id: 'b', resonanceCount: 10 })
      ];

      const ranked = rankPosts(posts, 'recommend', [], defaultRankingConfig);

      ranked.forEach(post => {
        expect(post).toHaveProperty('score');
        expect(typeof post.score).toBe('number');
        expect(post.score).toBeGreaterThan(0);
      });
    });

    it('should return empty array for empty input', () => {
      const ranked = rankPosts([], 'recommend', [], defaultRankingConfig);
      expect(ranked).toEqual([]);
    });

    it('should not mutate the original posts array', () => {
      const p1 = createMockPost({ _id: 'p1', resonanceCount: 1 });
      const p2 = createMockPost({ _id: 'p2', resonanceCount: 2 });
      const posts = [p1, p2];
      const originalOrder = posts.map(p => p._id);

      rankPosts(posts, 'recommend', [], defaultRankingConfig);

      expect(posts.map(p => p._id)).toEqual(originalOrder);
    });
  });
});
