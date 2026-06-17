const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { User, Post, Resonance, Comment, Message, SensitiveWord, PaymentOrder } = require('../../src/models');
const { signToken } = require('../../src/utils/auth');

const ObjectId = mongoose.Types.ObjectId;

const createTestUser = async (overrides = {}) => {
  const password = overrides.password || 'password123';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    openid: overrides.openid || `acct:test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    account: overrides.account || `testuser_${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    passwordHash,
    authProvider: 'password',
    nickname: overrides.nickname || '测试用户',
    avatar: overrides.avatar || '',
    bio: overrides.bio || '测试用户简介',
    isAdmin: overrides.isAdmin || false,
    status: overrides.status || 'active',
    premium: overrides.premium || { isActive: false, plan: '', expireAt: null },
    tagSkin: overrides.tagSkin || 'ocean'
  });

  return {
    user,
    password,
    token: signToken(user),
    userId: user._id
  };
};

const createAdminUser = async (overrides = {}) => {
  return createTestUser({
    ...overrides,
    isAdmin: true,
    account: overrides.account || `admin_${Date.now()}`,
    nickname: overrides.nickname || '管理员'
  });
};

const createPremiumUser = async (overrides = {}) => {
  const expireAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  return createTestUser({
    ...overrides,
    premium: {
      isActive: true,
      plan: overrides.plan || 'monthly',
      expireAt
    }
  });
};

const createBannedUser = async (overrides = {}) => {
  return createTestUser({
    ...overrides,
    status: 'banned',
    account: overrides.account || `banned_${Date.now()}`
  });
};

const createTestPost = async (authorId, overrides = {}) => {
  const post = await Post.create({
    title: overrides.title || '测试频率标题',
    contentText: overrides.contentText || '这是一条测试频率的内容文本，满足长度要求。',
    dynamicTag: overrides.dynamicTag || '#日常回声',
    tags: overrides.tags || ['测试', '回声岛'],
    type: overrides.type || 'origin',
    parentPost: overrides.parentPost || null,
    author: authorId,
    resonanceCount: overrides.resonanceCount || 0,
    commentCount: overrides.commentCount || 0,
    superEchoCount: overrides.superEchoCount || 0,
    authorSkin: overrides.authorSkin || 'ocean',
    status: overrides.status || 'published',
    createdAt: overrides.createdAt || new Date()
  });
  return post;
};

const createTestResonance = async (postId, userId) => {
  const resonance = await Resonance.create({
    user: userId,
    post: postId
  });
  await Post.findByIdAndUpdate(postId, { $inc: { resonanceCount: 1 } });
  return resonance;
};

const createTestComment = async (userId, postId, overrides = {}) => {
  const comment = await Comment.create({
    post: postId,
    user: userId,
    parentComment: overrides.parentComment || null,
    dynamicTag: overrides.dynamicTag || '#评论互动',
    content: overrides.content || '这是一条测试评论内容'
  });
  await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });
  return comment;
};

const createTestMessage = async (senderId, receiverId, overrides = {}) => {
  const conversationId = Message.generateConversationId(senderId, receiverId);
  const message = await Message.create({
    conversationId,
    sender: senderId,
    receiver: receiverId,
    sourcePost: overrides.sourcePost || null,
    senderDynamicTag: overrides.senderDynamicTag || '私信动态标签',
    content: overrides.content || '这是一条测试私信内容',
    read: overrides.read || false
  });
  return message;
};

const createSensitiveWords = async (words = []) => {
  const defaultWords = [
    { word: '违禁词', category: 'politics', level: 3, enabled: true },
    { word: '敏感词', category: 'advertising', level: 2, enabled: true },
    { word: '广告推销', category: 'advertising', level: 2, enabled: true }
  ];
  const toCreate = words.length > 0 ? words : defaultWords;
  const created = await SensitiveWord.create(toCreate);
  const { buildFilter } = require('../../src/services/auditService');
  await buildFilter(true);
  return created;
};

const createPremiumOrder = async (userId, plan = 'monthly', overrides = {}) => {
  const order = await PaymentOrder.create({
    orderNo: overrides.orderNo || `EI${Date.now()}${Math.floor(Math.random() * 900 + 100)}`,
    user: userId,
    plan,
    amount: overrides.amount || 29,
    status: overrides.status || 'paid',
    paidAt: overrides.paidAt || new Date()
  });
  return order;
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

const validObjectId = () => new ObjectId().toString();

const invalidObjectId = () => 'invalid-object-id';

module.exports = {
  ObjectId,
  createTestUser,
  createAdminUser,
  createPremiumUser,
  createBannedUser,
  createTestPost,
  createTestResonance,
  createTestComment,
  createTestMessage,
  createSensitiveWords,
  createPremiumOrder,
  authHeader,
  validObjectId,
  invalidObjectId
};
