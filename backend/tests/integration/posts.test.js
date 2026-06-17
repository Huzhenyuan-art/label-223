const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/appFactory');
const {
  createTestUser,
  createTestPost,
  createSensitiveWords,
  authHeader,
  validObjectId,
  invalidObjectId
} = require('../helpers/testHelpers');

describe('Frequency Posts (频率发布) Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/posts (Create Post)', () => {
    it('should create a post successfully with all required fields', async () => {
      const { token, userId } = await createTestUser();
      const postData = {
        title: '测试频率标题',
        contentText: '这是一条来自回声岛的测试频率内容，充满了美好的思绪。',
        dynamicTag: '#黄昏时分的思绪',
        tags: ['音乐', '生活', '日常']
      };

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send(postData);

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.title).toBe('测试频率标题');
      expect(response.body.data.dynamicTag).toBe('#黄昏时分的思绪');
      expect(response.body.data.tags).toEqual(expect.arrayContaining(['音乐', '生活', '日常']));
      expect(response.body.data.author.toString()).toBe(userId.toString());
      expect(response.body.data.status).toBe('published');
      expect(response.body.data.type).toBe('origin');
      expect(response.body.auditInfo).toBeDefined();
      expect(response.body.auditInfo.action).toBeDefined();
      expect(response.body.auditInfo.matchedWords).toBeDefined();
    });

    it('should return 400 for post without any tags', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '无标签帖子',
          contentText: '这条帖子没有标签',
          dynamicTag: '#测试动态标签',
          tags: []
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(1);
    });

    it('should sanitize and normalize tags (lowercase, remove #, dedupe)', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '标签清洗测试',
          contentText: '测试标签清洗',
          dynamicTag: '#测试',
          tags: ['#Music', '  music ', 'MUSIC', '#阅读', '阅读']
        });

      expect(response.status).toBe(201);
      expect(response.body.data.tags).toContain('music');
      expect(response.body.data.tags).toContain('阅读');
      expect(response.body.data.tags.length).toBe(2);
    });

    it('should limit tags to maxTagsPerPost config value (validator enforces max 5)', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '标签数量限制',
          contentText: '测试标签数量上限超过5个会被validator拦截',
          dynamicTag: '#测试',
          tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('请求参数错误');
    });

    it('should accept exactly maxTagsPerPost (5) tags', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '五标签',
          contentText: '恰好5个标签可以通过',
          dynamicTag: '#测试',
          tags: ['标签一', '标签二', '标签三', '标签四', '标签五']
        });

      expect(response.status).toBe(201);
      expect(response.body.data.tags.length).toBe(5);
    });

    it('should reject post containing high-level sensitive words', async () => {
      await createSensitiveWords([
        { word: '高危违禁', category: 'politics', level: 3, enabled: true }
      ]);
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '正常标题',
          contentText: '这里包含高危违禁内容',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toContain('违规');
      expect(response.body.data.matchedWords.length).toBeGreaterThan(0);
    });

    it('should mask mid-level sensitive words instead of blocking', async () => {
      await createSensitiveWords([
        { word: '敏感词', category: 'advertising', level: 2, enabled: true }
      ]);
      const { token } = await createTestUser();

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '正常标题',
          contentText: '这里有敏感词需要处理',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(201);
      expect(response.body.auditInfo.action).toBe('masked');
      expect(response.body.data.contentText).not.toContain('敏感词');
      expect(response.body.data.contentText).toContain('***');
    });

    it('should return 401 for unauthenticated post creation', async () => {
      const response = await request(app)
        .post('/api/posts')
        .send({
          title: '未授权帖子',
          contentText: '没有token',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(401);
    });

    it('should assign correct authorSkin based on user tagSkin preference', async () => {
      const { token } = await createTestUser({ tagSkin: 'sunset' });

      const response = await request(app)
        .post('/api/posts')
        .set(authHeader(token))
        .send({
          title: '皮肤测试',
          contentText: '测试用户标签皮肤',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(201);
      expect(response.body.data.authorSkin).toBe('sunset');
    });
  });

  describe('PUT /api/posts/:id (Update Post)', () => {
    it('should update post content for the owner', async () => {
      const { token, userId } = await createTestUser();
      const post = await createTestPost(userId, {
        title: '原始标题',
        contentText: '原始内容'
      });

      const response = await request(app)
        .put(`/api/posts/${post._id}`)
        .set(authHeader(token))
        .send({
          title: '更新后的标题',
          contentText: '更新后的内容文本',
          dynamicTag: '#新动态标签',
          tags: ['新标签']
        });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.title).toBe('更新后的标题');
      expect(response.body.data.contentText).toBe('更新后的内容文本');
      expect(response.body.data.tags).toContain('新标签');
    });

    it('should reject update from non-owner user', async () => {
      const { userId: ownerId } = await createTestUser({ account: 'owner_user' });
      const { token: hackerToken } = await createTestUser({ account: 'hacker_user' });
      const post = await createTestPost(ownerId);

      const response = await request(app)
        .put(`/api/posts/${post._id}`)
        .set(authHeader(hackerToken))
        .send({
          title: '被篡改的标题',
          contentText: '被篡改的内容',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toContain('permission');
    });

    it('should return 404 for non-existent post', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .put(`/api/posts/${validObjectId()}`)
        .set(authHeader(token))
        .send({
          title: '不存在',
          contentText: '不存在的帖子',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid post id format', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .put(`/api/posts/${invalidObjectId()}`)
        .set(authHeader(token))
        .send({
          title: '非法ID',
          contentText: '测试',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(400);
    });

    it('should reject updating super_echo posts', async () => {
      const { token, userId } = await createTestUser();
      const parent = await createTestPost(userId);
      const superEcho = await createTestPost(userId, {
        type: 'super_echo',
        parentPost: parent._id
      });

      const response = await request(app)
        .put(`/api/posts/${superEcho._id}`)
        .set(authHeader(token))
        .send({
          title: '试图更新合鸣',
          contentText: '更新内容',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Only origin');
    });
  });

  describe('DELETE /api/posts/:id (Delete Post)', () => {
    it('should delete a post successfully for the owner', async () => {
      const { Post } = require('../../src/models');
      const { token, userId } = await createTestUser();
      const post = await createTestPost(userId);

      const response = await request(app)
        .delete(`/api/posts/${post._id}`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);

      const deletedPost = await Post.findById(post._id);
      expect(deletedPost).toBeNull();
    });

    it('should reject deletion from non-owner', async () => {
      const { userId: ownerId } = await createTestUser({ account: 'del_owner' });
      const { token: otherToken } = await createTestUser({ account: 'del_other' });
      const post = await createTestPost(ownerId);

      const response = await request(app)
        .delete(`/api/posts/${post._id}`)
        .set(authHeader(otherToken));

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent post deletion', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .delete(`/api/posts/${validObjectId()}`)
        .set(authHeader(token));

      expect(response.status).toBe(404);
    });

    it('should delete associated resonances and comments when post is deleted', async () => {
      const { Resonance, Comment } = require('../../src/models');
      const { token, userId } = await createTestUser();
      const { userId: otherUserId } = await createTestUser({ account: 'interactor' });
      const post = await createTestPost(userId);

      await Resonance.create({ post: post._id, user: otherUserId });
      await Comment.create({ post: post._id, user: otherUserId, dynamicTag: '#t', content: 'c' });

      await request(app)
        .delete(`/api/posts/${post._id}`)
        .set(authHeader(token));

      const resonanceCount = await Resonance.countDocuments({ post: post._id });
      const commentCount = await Comment.countDocuments({ post: post._id });
      expect(resonanceCount).toBe(0);
      expect(commentCount).toBe(0);
    });

    it('should reject deleting non-origin (super_echo) posts', async () => {
      const { token, userId } = await createTestUser();
      const parent = await createTestPost(userId);
      const superEcho = await createTestPost(userId, {
        type: 'super_echo',
        parentPost: parent._id
      });

      const response = await request(app)
        .delete(`/api/posts/${superEcho._id}`)
        .set(authHeader(token));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Only origin');
    });
  });

  describe('POST /api/posts/:id/resonance (Toggle Resonance)', () => {
    it('should add resonance on first toggle', async () => {
      const { Post } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'res_author' });
      const { token, userId: resonaterId } = await createTestUser({ account: 'res_user' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.resonated).toBe(true);
      expect(response.body.data.resonanceCount).toBe(1);

      const updatedPost = await Post.findById(post._id);
      expect(updatedPost.resonanceCount).toBe(1);
    });

    it('should remove resonance on second toggle', async () => {
      const { Post, Resonance } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'res2_author' });
      const { token, userId: resonaterId } = await createTestUser({ account: 'res2_user' });
      const post = await createTestPost(authorId);

      await Resonance.create({ post: post._id, user: resonaterId });
      await Post.findByIdAndUpdate(post._id, { $inc: { resonanceCount: 1 } });

      const response = await request(app)
        .post(`/api/posts/${post._id}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.resonated).toBe(false);
      expect(response.body.data.resonanceCount).toBe(0);
    });

    it('should return 404 for non-existent post', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post(`/api/posts/${validObjectId()}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/posts/:id/comment (Create Comment)', () => {
    it('should create a comment successfully', async () => {
      const { Post } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'cmt_author' });
      const { token, userId: commenterId } = await createTestUser({ account: 'cmt_user' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment`)
        .set(authHeader(token))
        .send({
          content: '这是一条评论内容',
          dynamicTag: '#评论互动'
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.content).toBe('这是一条评论内容');
      expect(response.body.data.dynamicTag).toBe('#评论互动');
      expect(response.body.data.post.toString()).toBe(post._id.toString());
      expect(response.body.data.user._id.toString()).toBe(commenterId.toString());
      expect(response.body.data.parentComment).toBeNull();
      expect(response.body.auditInfo).toBeDefined();

      const updatedPost = await Post.findById(post._id);
      expect(updatedPost.commentCount).toBe(1);
    });

    it('should return 404 if post does not exist', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post(`/api/posts/${validObjectId()}/comment`)
        .set(authHeader(token))
        .send({
          content: '评论不存在的帖子',
          dynamicTag: '#测试'
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 for comment without dynamicTag', async () => {
      const { userId: authorId } = await createTestUser({ account: 'cmt3_author' });
      const { token } = await createTestUser({ account: 'cmt3_user' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment`)
        .set(authHeader(token))
        .send({
          content: '没有动态标签的评论'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/posts/:id/comment/:commentId/reply (Comment Reply)', () => {
    it('should reply to a parent comment successfully', async () => {
      const { Comment } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'rpl_author' });
      const { userId: commenterId } = await createTestUser({ account: 'rpl_commenter' });
      const { token, userId: replierId } = await createTestUser({ account: 'rpl_replier' });
      const post = await createTestPost(authorId);
      const parentComment = await Comment.create({
        post: post._id,
        user: commenterId,
        parentComment: null,
        dynamicTag: '#父评论',
        content: '我是父评论'
      });

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment/${parentComment._id}/reply`)
        .set(authHeader(token))
        .send({
          content: '这是一条回复',
          dynamicTag: '#回复互动'
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.content).toBe('这是一条回复');
      expect(response.body.data.parentComment._id.toString()).toBe(parentComment._id.toString());
    });

    it('should reject nested reply beyond second level (二级嵌套禁止)', async () => {
      const { Comment } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'rpl2_author' });
      const { userId: commenterId } = await createTestUser({ account: 'rpl2_commenter' });
      const { token, userId: replierId } = await createTestUser({ account: 'rpl2_replier' });
      const post = await createTestPost(authorId);
      const parentComment = await Comment.create({
        post: post._id,
        user: commenterId,
        parentComment: null,
        dynamicTag: '#父评论',
        content: '我是父评论'
      });
      const firstLevelReply = await Comment.create({
        post: post._id,
        user: replierId,
        parentComment: parentComment._id,
        dynamicTag: '#一级回复',
        content: '我是一级回复'
      });

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment/${firstLevelReply._id}/reply`)
        .set(authHeader(token))
        .send({
          content: '试图二级嵌套回复',
          dynamicTag: '#二级回复'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Only one level');
    });

    it('should return 404 if parent comment does not exist', async () => {
      const { userId: authorId } = await createTestUser({ account: 'rpl3_author' });
      const { token } = await createTestUser({ account: 'rpl3_replier' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment/${validObjectId()}/reply`)
        .set(authHeader(token))
        .send({
          content: '回复不存在的评论',
          dynamicTag: '#测试'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/feed/ocean (Ocean Feed)', () => {
    it('should return paginated post list', async () => {
      const { userId } = await createTestUser();
      for (let i = 0; i < 15; i++) {
        await createTestPost(userId, { title: `帖子${i}` });
      }

      const response = await request(app)
        .get('/api/feed/ocean')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.list.length).toBeLessThanOrEqual(10);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(10);
      expect(response.body.data.pagination.total).toBe(15);
      expect(response.body.data.pagination.pages).toBe(2);
      expect(response.body.data.viewerPremium).toBeDefined();
    });

    it('should filter posts by tags', async () => {
      const { userId } = await createTestUser();
      await createTestPost(userId, { tags: ['音乐', '流行'] });
      await createTestPost(userId, { tags: ['阅读', '文学'] });
      await createTestPost(userId, { tags: ['旅行', '摄影'] });

      const response = await request(app)
        .get('/api/feed/ocean')
        .query({ tagFilter: '音乐' });

      expect(response.status).toBe(200);
      const allTags = response.body.data.list.flatMap(p => p.tags);
      expect(allTags).toContain('音乐');
    });

    it('should search posts by keyword', async () => {
      const { userId } = await createTestUser();
      await createTestPost(userId, {
        title: '独特的猫咪故事',
        contentText: '关于一只可爱的猫'
      });
      await createTestPost(userId, {
        title: '狗狗的日常',
        contentText: '忠诚的狗狗们'
      });

      const response = await request(app)
        .get('/api/feed/ocean')
        .query({ keyword: '猫咪' });

      expect(response.status).toBe(200);
      expect(response.body.data.list.length).toBeGreaterThanOrEqual(1);
      const titles = response.body.data.list.map(p => p.title);
      expect(titles.some(t => t.includes('猫咪'))).toBe(true);
    });

    it('should mark isResonated and isFavorited for authenticated user', async () => {
      const { User, Resonance } = require('../../src/models');
      const { token, userId } = await createTestUser();
      const { userId: authorId } = await createTestUser({ account: 'feed_author' });
      const post = await createTestPost(authorId);

      await Resonance.create({ post: post._id, user: userId });
      await User.findByIdAndUpdate(userId, { $addToSet: { favoritePosts: post._id } });

      const response = await request(app)
        .get('/api/feed/ocean')
        .set(authHeader(token))
        .query({ limit: 20 });

      expect(response.status).toBe(200);
      const targetPost = response.body.data.list.find(p => p._id.toString() === post._id.toString());
      expect(targetPost).toBeDefined();
      expect(targetPost.isResonated).toBe(true);
      expect(targetPost.isFavorited).toBe(true);
    });

    it('should handle empty feed gracefully', async () => {
      const response = await request(app)
        .get('/api/feed/ocean');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(Array.isArray(response.body.data.list)).toBe(true);
    });
  });

  describe('GET /api/feed/hot-tags (Hot Tags Ranking)', () => {
    it('should return hot tags list with ranking', async () => {
      const { userId } = await createTestUser();
      for (let i = 0; i < 5; i++) {
        await createTestPost(userId, {
          tags: ['热门话题'],
          resonanceCount: i * 10,
          commentCount: i * 5
        });
      }

      const response = await request(app)
        .get('/api/feed/hot-tags');

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.list).toBeDefined();
      expect(Array.isArray(response.body.data.list)).toBe(true);
      expect(response.body.data.window).toBeDefined();
    });

    it('should include heat metrics and rank for each tag', async () => {
      const { userId } = await createTestUser();
      await createTestPost(userId, {
        tags: ['测试热榜'],
        resonanceCount: 100,
        commentCount: 50,
        superEchoCount: 10
      });

      const response = await request(app)
        .get('/api/feed/hot-tags');

      expect(response.status).toBe(200);
      const tag = response.body.data.list.find(t => t.tag === '测试热榜');
      if (tag) {
        expect(tag.heat).toBeDefined();
        expect(tag.postCount).toBeGreaterThanOrEqual(1);
        expect(tag.rank).toBeDefined();
      }
    });

    it('should return nextUpdateAt timestamp', async () => {
      const response = await request(app)
        .get('/api/feed/hot-tags');

      expect(response.body.data.nextUpdateAt).toBeDefined();
    });
  });

  describe('GET /api/feed/posts/:id (Post Detail)', () => {
    it('should return post detail with author info', async () => {
      const { userId } = await createTestUser({ nickname: '作者昵称' });
      const post = await createTestPost(userId, {
        title: '详情页帖子',
        contentText: '详情页内容'
      });

      const response = await request(app)
        .get(`/api/feed/posts/${post._id}`);

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.post.title).toBe('详情页帖子');
      expect(response.body.data.post.author).toBeDefined();
      expect(response.body.data.post.author.nickname).toBe('作者昵称');
      expect(response.body.data.viewerPremium).toBeDefined();
    });

    it('should return 404 for removed posts', async () => {
      const { Post } = require('../../src/models');
      const { userId } = await createTestUser();
      const post = await createTestPost(userId);
      await Post.findByIdAndUpdate(post._id, { status: 'removed' });

      const response = await request(app)
        .get(`/api/feed/posts/${post._id}`);

      expect(response.status).toBe(404);
    });

    it('should include comments and super echoes in detail', async () => {
      const { Comment, Post } = require('../../src/models');
      const { userId, token } = await createTestUser();
      const post = await createTestPost(userId);

      await Comment.create({
        post: post._id,
        user: userId,
        dynamicTag: '#评论',
        content: '这是一条评论'
      });

      await createTestPost(userId, {
        type: 'super_echo',
        parentPost: post._id
      });
      await Post.findByIdAndUpdate(post._id, { $inc: { superEchoCount: 1 } });

      const response = await request(app)
        .get(`/api/feed/posts/${post._id}`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.comments.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.superEchoes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/posts/:id/super-echo (Super Echo / 合鸣)', () => {
    it('should create a super echo linked to parent post', async () => {
      const { Post } = require('../../src/models');
      const { userId: parentAuthorId } = await createTestUser({ account: 'parent_auth' });
      const { token, userId: echoAuthorId } = await createTestUser({ account: 'echo_auth' });
      const parent = await createTestPost(parentAuthorId);

      const response = await request(app)
        .post(`/api/posts/${parent._id}/super-echo`)
        .set(authHeader(token))
        .send({
          title: '我的合鸣',
          contentText: '对这篇文章的合鸣内容',
          dynamicTag: '#深度思考',
          tags: ['合鸣', '思考']
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.type).toBe('super_echo');
      expect(response.body.data.parentPost.toString()).toBe(parent._id.toString());

      const updatedParent = await Post.findById(parent._id);
      expect(updatedParent.superEchoCount).toBe(1);
    });

    it('should return 404 for non-existent parent post', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post(`/api/posts/${validObjectId()}/super-echo`)
        .set(authHeader(token))
        .send({
          title: '测试',
          contentText: '测试',
          dynamicTag: '#测试',
          tags: ['测试']
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/posts/me (My Posts)', () => {
    it('should return only posts authored by current user', async () => {
      const { token, userId: myId } = await createTestUser({ account: 'my_posts_user' });
      const { userId: otherId } = await createTestUser({ account: 'other_posts_user' });

      await createTestPost(myId, { title: '我的帖子1' });
      await createTestPost(myId, { title: '我的帖子2' });
      await createTestPost(otherId, { title: '别人的帖子' });

      const response = await request(app)
        .get('/api/posts/me')
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.length).toBe(2);
      response.body.data.forEach(post => {
        expect(post.author.toString()).toBe(myId.toString());
      });
    });

    it('should sort by createdAt descending', async () => {
      const { token, userId } = await createTestUser();
      await createTestPost(userId, { title: '较早', createdAt: new Date('2024-01-01') });
      await createTestPost(userId, { title: '较新', createdAt: new Date() });

      const response = await request(app)
        .get('/api/posts/me')
        .set(authHeader(token));

      expect(response.body.data[0].title).toBe('较新');
    });
  });
});
