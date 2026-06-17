const request = require('supertest');
const mongoose = require('mongoose');
const { createTestApp } = require('../helpers/appFactory');
const {
  createTestUser,
  createTestPost,
  createTestResonance,
  createTestComment,
  createTestMessage,
  createSensitiveWords,
  authHeader,
  validObjectId,
  invalidObjectId
} = require('../helpers/testHelpers');

describe('Resonance & Messages (共鸣合鸣与私信) Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/posts/:id/resonance (Toggle Resonance)', () => {
    it('should add resonance to a post for the first time', async () => {
      const { Post, Resonance } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'res_author' });
      const { token, userId: resonatorId } = await createTestUser({ account: 'resonator' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.resonated).toBe(true);
      expect(response.body.data.resonanceCount).toBe(1);

      const resonance = await Resonance.findOne({ post: post._id, user: resonatorId });
      expect(resonance).not.toBeNull();

      const updatedPost = await Post.findById(post._id);
      expect(updatedPost.resonanceCount).toBe(1);
    });

    it('should remove resonance when toggled a second time', async () => {
      const { Post, Resonance } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'unres_author' });
      const { token, userId: resonatorId } = await createTestUser({ account: 'unresonator' });
      const post = await createTestPost(authorId);
      await Resonance.create({ post: post._id, user: resonatorId });
      await Post.findByIdAndUpdate(post._id, { $inc: { resonanceCount: 1 } });

      const response = await request(app)
        .post(`/api/posts/${post._id}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.resonated).toBe(false);
      expect(response.body.data.resonanceCount).toBe(0);

      const resonance = await Resonance.findOne({ post: post._id, user: resonatorId });
      expect(resonance).toBeNull();
    });

    it('should return 404 for non-existent post', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post(`/api/posts/${validObjectId()}/resonance`)
        .set(authHeader(token));

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/feed/posts/:id/resonances (Resonance List)', () => {
    it('should return paginated resonance list', async () => {
      const { Resonance } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'list_author' });
      const post = await createTestPost(authorId);

      for (let i = 0; i < 25; i++) {
        const u = await createTestUser({ account: `r_user_${i}` });
        await Resonance.create({ post: post._id, user: u.userId });
      }
      await require('../../src/models').Post.findByIdAndUpdate(post._id, { resonanceCount: 25 });

      const response = await request(app)
        .get(`/api/feed/posts/${post._id}/resonances`)
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.list.length).toBe(10);
      expect(response.body.data.pagination.total).toBe(25);
      expect(response.body.data.pagination.pages).toBe(3);
    });

    it('should include user info for each resonance', async () => {
      const { Resonance } = require('../../src/models');
      const { userId: authorId, user: author } = await createTestUser({
        account: 'info_author',
        nickname: '共鸣者昵称'
      });
      const post = await createTestPost(authorId);
      await Resonance.create({ post: post._id, user: authorId });

      const response = await request(app)
        .get(`/api/feed/posts/${post._id}/resonances`);

      expect(response.status).toBe(200);
      const firstRes = response.body.data.list[0];
      expect(firstRes.user).toBeDefined();
      expect(firstRes.user.nickname).toBe('共鸣者昵称');
    });
  });

  describe('POST /api/posts/:id/comment (Create Comment)', () => {
    it('should create a comment successfully', async () => {
      const { Comment, Post } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'cmt_author' });
      const { token, userId: commenterId } = await createTestUser({ account: 'commenter' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment`)
        .set(authHeader(token))
        .send({
          dynamicTag: '#评论标签',
          content: '这是一条真实有效的评论内容'
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.content).toBe('这是一条真实有效的评论内容');
      expect(response.body.data.dynamicTag).toBe('#评论标签');

      const comment = await Comment.findById(response.body.data._id);
      expect(comment.post.toString()).toBe(post._id.toString());
      expect(comment.user.toString()).toBe(commenterId.toString());

      const updatedPost = await Post.findById(post._id);
      expect(updatedPost.commentCount).toBe(1);
    });

    it('should return 404 when commenting on non-existent post', async () => {
      const { token } = await createTestUser();

      const response = await request(app)
        .post(`/api/posts/${validObjectId()}/comment`)
        .set(authHeader(token))
        .send({
          dynamicTag: '#test',
          content: 'test comment'
        });

      expect(response.status).toBe(404);
    });

    it('should block comments with high-level sensitive words', async () => {
      await createSensitiveWords([
        { word: '辱骂内容', category: 'insult', level: 3, enabled: true }
      ]);
      const { userId: authorId } = await createTestUser({ account: 'audit_cmt_author' });
      const { token } = await createTestUser({ account: 'audit_commenter' });
      const post = await createTestPost(authorId);

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment`)
        .set(authHeader(token))
        .send({
          dynamicTag: '#test',
          content: '这里包含辱骂内容'
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe(1);
      expect(response.body.message).toContain('违规信息');
    });
  });

  describe('POST /api/posts/:id/comment/:commentId/reply (Comment Reply)', () => {
    it('should create a reply to a comment', async () => {
      const { Comment, Post } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'reply_author' });
      const { userId: parentCommenterId } = await createTestUser({ account: 'parent_c' });
      const { token, userId: replierId } = await createTestUser({ account: 'replier' });
      const post = await createTestPost(authorId);
      const parentComment = await Comment.create({
        post: post._id,
        user: parentCommenterId,
        parentComment: null,
        dynamicTag: '#tag',
        content: 'parent comment'
      });
      await Post.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment/${parentComment._id}/reply`)
        .set(authHeader(token))
        .send({
          dynamicTag: '#回复',
          content: '这是对评论的回复'
        });

      expect(response.status).toBe(201);
      expect(response.body.code).toBe(0);
      expect(response.body.data.parentComment._id.toString()).toBe(parentComment._id.toString());
    });

    it('should reject nested replies deeper than 1 level', async () => {
      const { Comment, Post } = require('../../src/models');
      const { userId: authorId } = await createTestUser({ account: 'nested_author' });
      const { userId: c1Id } = await createTestUser({ account: 'c1' });
      const { userId: c2Id } = await createTestUser({ account: 'c2' });
      const { token, userId: c3Id } = await createTestUser({ account: 'c3' });

      const post = await createTestPost(authorId);
      const parent = await Comment.create({
        post: post._id,
        user: c1Id,
        parentComment: null,
        dynamicTag: '#t',
        content: 'p'
      });
      const reply = await Comment.create({
        post: post._id,
        user: c2Id,
        parentComment: parent._id,
        dynamicTag: '#t',
        content: 'r'
      });

      const response = await request(app)
        .post(`/api/posts/${post._id}/comment/${reply._id}/reply`)
        .set(authHeader(token))
        .send({
          dynamicTag: '#t',
          content: 'cannot reply to reply'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Only one level');
    });
  });

  describe('Private Messages (私信)', () => {
    describe('Business Rule: First message must be from resonated post', () => {
      it('should reject first message without postId', async () => {
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_sender1' });
        const { userId: receiverId } = await createTestUser({ account: 'msg_receiver1' });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId,
            senderDynamicTag: '#标签',
            content: '你好呀，未经共鸣的私信'
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('resonated post');
      });

      it('should reject first message targeting non-post-author', async () => {
        const { Resonance } = require('../../src/models');
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_sender2' });
        const { userId: postAuthorId } = await createTestUser({ account: 'msg_post_author' });
        const { userId: randomReceiverId } = await createTestUser({ account: 'msg_random' });

        const post = await createTestPost(postAuthorId);
        await Resonance.create({ post: post._id, user: senderId });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId: randomReceiverId,
            senderDynamicTag: '#标签',
            content: '错误的接收者',
            postId: post._id
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('author of the resonated post');
      });

      it('should reject first message without prior resonance', async () => {
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_sender3' });
        const { userId: postAuthorId } = await createTestUser({ account: 'msg_post_author2' });
        const post = await createTestPost(postAuthorId);

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId: postAuthorId,
            senderDynamicTag: '#标签',
            content: '没有共鸣就私信',
            postId: post._id
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('resonate');
      });

      it('should allow first message from author of resonated post', async () => {
        const { Resonance, Message } = require('../../src/models');
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_sender_ok' });
        const { userId: postAuthorId } = await createTestUser({ account: 'msg_post_author_ok' });
        const post = await createTestPost(postAuthorId);
        await Resonance.create({ post: post._id, user: senderId });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId: postAuthorId,
            senderDynamicTag: '#共鸣者',
            content: '你好，我对你的帖子很有共鸣！',
            postId: post._id
          });

        expect(response.status).toBe(201);
        expect(response.body.code).toBe(0);
        expect(response.body.data.sourcePost._id.toString()).toBe(post._id.toString());

        const msgCount = await Message.countDocuments({
          sender: senderId,
          receiver: postAuthorId
        });
        expect(msgCount).toBe(1);
      });
    });

    describe('Subsequent messages', () => {
      it('should allow subsequent messages without postId after initial valid message', async () => {
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_seq_sender' });
        const { userId: receiverId, token: receiverToken } = await createTestUser({ account: 'msg_seq_receiver' });
        const { Resonance, Message } = require('../../src/models');

        const post = await createTestPost(receiverId);
        await Resonance.create({ post: post._id, user: senderId });
        await Message.create({
          conversationId: Message.generateConversationId(senderId, receiverId),
          sender: senderId,
          receiver: receiverId,
          sourcePost: post._id,
          senderDynamicTag: 'first',
          content: 'First message'
        });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId,
            senderDynamicTag: '#继续',
            content: '这是第二条消息，不需要postId'
          });

        expect(response.status).toBe(201);
        expect(response.body.code).toBe(0);
        expect(response.body.data.content).toBe('这是第二条消息，不需要postId');
      });
    });

    describe('Message edge cases', () => {
      it('should reject message to self', async () => {
        const { userId, token } = await createTestUser({ account: 'msg_self' });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(token))
          .send({
            receiverId: userId,
            senderDynamicTag: '#自己',
            content: '给自己发消息'
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('yourself');
      });

      it('should reject message to non-existent user', async () => {
        const { token } = await createTestUser({ account: 'msg_ghost' });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(token))
          .send({
            receiverId: validObjectId(),
            senderDynamicTag: '#test',
            content: 'test'
          });

        expect(response.status).toBe(404);
      });

      it('should audit and block messages with high-level sensitive words', async () => {
        const { Resonance, Message } = require('../../src/models');
        await createSensitiveWords([
          { word: '辱骂', category: 'insult', level: 3, enabled: true }
        ]);
        const { userId: senderId, token: senderToken } = await createTestUser({ account: 'msg_audit_s' });
        const { userId: receiverId } = await createTestUser({ account: 'msg_audit_r' });
        const post = await createTestPost(receiverId);
        await Resonance.create({ post: post._id, user: senderId });
        await Message.create({
          conversationId: Message.generateConversationId(senderId, receiverId),
          sender: senderId,
          receiver: receiverId,
          sourcePost: post._id,
          senderDynamicTag: 't',
          content: 'hi'
        });

        const response = await request(app)
          .post('/api/messages/send')
          .set(authHeader(senderToken))
          .send({
            receiverId,
            senderDynamicTag: '#test',
            content: '这条私信包含辱骂内容'
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('违规信息');
      });
    });
  });

  describe('Identity Reveal (身份揭示)', () => {
    const exchangeMinimumMessages = async (sender, receiver, postId) => {
      const { Resonance, Message } = require('../../src/models');
      await Resonance.create({ post: postId, user: sender.userId });
      const convId = Message.generateConversationId(sender.userId, receiver.userId);
      for (let i = 0; i < 3; i++) {
        await Message.create({
          conversationId: convId,
          sender: sender.userId,
          receiver: receiver.userId,
          sourcePost: i === 0 ? postId : null,
          senderDynamicTag: `s${i}`,
          content: `Sender message ${i + 1}`
        });
      }
      for (let i = 0; i < 3; i++) {
        await Message.create({
          conversationId: convId,
          sender: receiver.userId,
          receiver: sender.userId,
          senderDynamicTag: `r${i}`,
          content: `Receiver message ${i + 1}`
        });
      }
    };

    it('should reject reveal request before 3 messages each', async () => {
      const { Message } = require('../../src/models');
      const sender = await createTestUser({ account: 'rv_sender_early' });
      const receiver = await createTestUser({ account: 'rv_receiver_early' });
      const post = await createTestPost(receiver.userId);
      const { Resonance } = require('../../src/models');
      await Resonance.create({ post: post._id, user: sender.userId });

      const convId = Message.generateConversationId(sender.userId, receiver.userId);
      await Message.create({
        conversationId: convId, sender: sender.userId, receiver: receiver.userId,
        sourcePost: post._id, senderDynamicTag: 't', content: '1'
      });
      await Message.create({
        conversationId: convId, sender: receiver.userId, receiver: sender.userId,
        senderDynamicTag: 't', content: '2'
      });

      const response = await request(app)
        .post('/api/messages/conversations/reveal')
        .set(authHeader(sender.token))
        .send({ otherUserId: receiver.userId });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Need at least 3 messages');
    });

    it('should process reveal request after meeting message threshold', async () => {
      const { RevealDecision } = require('../../src/models');
      const sender = await createTestUser({ account: 'rv_sender_ok' });
      const receiver = await createTestUser({ account: 'rv_receiver_ok' });
      const post = await createTestPost(receiver.userId);

      await exchangeMinimumMessages(sender, receiver, post._id);

      const response = await request(app)
        .post('/api/messages/conversations/reveal')
        .set(authHeader(sender.token))
        .send({ otherUserId: receiver.userId });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.myAgreed).toBe(true);
      expect(response.body.data.eligible).toBe(true);
      expect(response.body.data.waitingForOther).toBe(true);

      const decision = await RevealDecision.findOne({
        conversationId: require('../../src/models').Message.generateConversationId(
          sender.userId, receiver.userId
        )
      });
      expect(decision).not.toBeNull();
      expect(decision.revealed).toBe(false);
    });

    it('should reveal identity when both parties agree', async () => {
      const { RevealDecision } = require('../../src/models');
      const sender = await createTestUser({ account: 'rv_both_s' });
      const receiver = await createTestUser({ account: 'rv_both_r' });
      const post = await createTestPost(receiver.userId);

      await exchangeMinimumMessages(sender, receiver, post._id);

      await request(app)
        .post('/api/messages/conversations/reveal')
        .set(authHeader(sender.token))
        .send({ otherUserId: receiver.userId });

      const response = await request(app)
        .post('/api/messages/conversations/reveal')
        .set(authHeader(receiver.token))
        .send({ otherUserId: sender.userId });

      expect(response.status).toBe(200);
      expect(response.body.data.revealed).toBe(true);
      expect(response.body.data.unlockedAt).toBeDefined();

      const decision = await RevealDecision.findOne({
        conversationId: require('../../src/models').Message.generateConversationId(
          sender.userId, receiver.userId
        )
      });
      expect(decision.revealed).toBe(true);
      expect(decision.unlockedAt).not.toBeNull();
    });

    it('should mask other user identity before reveal in conversation list', async () => {
      const sender = await createTestUser({
        account: 'rv_mask_s',
        nickname: '发送者真实昵称',
        avatar: 'https://example.com/sender.png'
      });
      const receiver = await createTestUser({
        account: 'rv_mask_r',
        nickname: '接收者真实昵称',
        avatar: 'https://example.com/receiver.png'
      });
      const post = await createTestPost(receiver.userId);
      const { Resonance, Message } = require('../../src/models');

      await Resonance.create({ post: post._id, user: sender.userId });
      await Message.create({
        conversationId: Message.generateConversationId(sender.userId, receiver.userId),
        sender: sender.userId,
        receiver: receiver.userId,
        sourcePost: post._id,
        senderDynamicTag: 's',
        content: 'hi'
      });

      const response = await request(app)
        .get('/api/messages/conversations')
        .set(authHeader(sender.token));

      expect(response.status).toBe(200);
      const conv = response.body.data[0];
      expect(conv.user.nickname).not.toBe('接收者真实昵称');
      expect(conv.user.avatar).toBe('');
    });

    it('should return 403 when accessing public profile without reveal', async () => {
      const sender = await createTestUser({ account: 'pp_sender' });
      const receiver = await createTestUser({ account: 'pp_receiver' });

      const response = await request(app)
        .get(`/api/users/public/${receiver.userId}`)
        .set(authHeader(sender.token));

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('locked');
    });

    it('should allow accessing own public profile', async () => {
      const sender = await createTestUser({ account: 'pp_self', nickname: '我自己' });

      const response = await request(app)
        .get(`/api/users/public/${sender.userId}`)
        .set(authHeader(sender.token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.profile.nickname).toBe('我自己');
    });
  });

  describe('GET /api/messages/conversations', () => {
    it('should return conversation list with correct unread counts', async () => {
      const { Message } = require('../../src/models');
      const u1 = await createTestUser({ account: 'conv_u1' });
      const u2 = await createTestUser({ account: 'conv_u2' });
      const u3 = await createTestUser({ account: 'conv_u3' });

      const conv1 = Message.generateConversationId(u1.userId, u2.userId);
      const conv2 = Message.generateConversationId(u1.userId, u3.userId);
      await Message.create({
        conversationId: conv1, sender: u2.userId, receiver: u1.userId,
        senderDynamicTag: 't', content: 'm1', read: false
      });
      await Message.create({
        conversationId: conv1, sender: u2.userId, receiver: u1.userId,
        senderDynamicTag: 't', content: 'm2', read: false
      });
      await Message.create({
        conversationId: conv2, sender: u3.userId, receiver: u1.userId,
        senderDynamicTag: 't', content: 'm3', read: true
      });

      const response = await request(app)
        .get('/api/messages/conversations')
        .set(authHeader(u1.token));

      expect(response.status).toBe(200);
      expect(response.body.code).toBe(0);
      expect(response.body.data.length).toBe(2);
      const c1 = response.body.data.find(c =>
        c.conversationId === Message.generateConversationId(u1.userId, u2.userId)
      );
      expect(c1.unreadCount).toBe(2);
    });
  });

  describe('GET /api/messages/conversations/:conversationId/messages', () => {
    it('should reject access to conversation user is not part of', async () => {
      const { Message } = require('../../src/models');
      const u1 = await createTestUser({ account: 'forbid_u1' });
      const u2 = await createTestUser({ account: 'forbid_u2' });
      const u3 = await createTestUser({ account: 'forbid_u3' });
      const convId = Message.generateConversationId(u1.userId, u2.userId);
      await Message.create({
        conversationId: convId, sender: u1.userId, receiver: u2.userId,
        senderDynamicTag: 't', content: 'private'
      });

      const response = await request(app)
        .get(`/api/messages/conversations/${convId}/messages`)
        .set(authHeader(u3.token));

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Forbidden');
    });
  });
});
