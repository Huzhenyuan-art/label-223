const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User } = require('../models');
const logger = require('../utils/logger');
const { signToken } = require('../utils/auth');
const {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError
} = require('../utils/errors');

const DEFAULT_AVATARS = [
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/1704488/pexels-photo-1704488.jpeg?auto=compress&cs=tinysrgb&w=200'
];

const normalizeAccount = (value) => String(value || '').trim().toLowerCase();

const getDefaultAvatar = (seed) => {
  const total = [...String(seed || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DEFAULT_AVATARS[total % DEFAULT_AVATARS.length];
};

const normalizePremium = (premium) => {
  if (!premium || !premium.isActive || !premium.expireAt) {
    return { isActive: false, plan: '', expireAt: null };
  }

  const now = Date.now();
  if (new Date(premium.expireAt).getTime() <= now) {
    return { isActive: false, plan: '', expireAt: null };
  }

  return {
    isActive: true,
    plan: premium.plan,
    expireAt: premium.expireAt
  };
};

const serializeUser = (user, premium = normalizePremium(user?.premium)) => ({
  id: user._id,
  account: user.account || '',
  nickname: user.nickname,
  avatar: user.avatar,
  bio: user.bio,
  tagSkin: user.tagSkin,
  premium
});

const buildSessionPayload = async (user) => {
  const premium = normalizePremium(user.premium);

  user.lastLoginAt = new Date();
  if (user.premium?.isActive && !premium.isActive) {
    user.premium = premium;
  }

  await user.save();

  return {
    token: signToken(user),
    user: serializeUser(user, premium)
  };
};

const register = async ({ nickname, account, password }) => {
  const normalizedAccount = normalizeAccount(account);
  const trimmedNickname = String(nickname || '').trim();

  const existing = await User.findOne({ account: normalizedAccount }).select('_id').lean();
  if (existing) {
    throw ConflictError('账号已被占用，请更换后重试');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    openid: `acct:${normalizedAccount}`,
    account: normalizedAccount,
    passwordHash,
    authProvider: 'password',
    nickname: trimmedNickname,
    avatar: getDefaultAvatar(normalizedAccount),
    bio: '在回声岛留下第一条真实回声。'
  });

  const session = await buildSessionPayload(user);
  logger.info(`User registered: ${user._id}`);

  return session;
};

const login = async ({ account, password }) => {
  const normalizedAccount = normalizeAccount(account);

  const user = await User.findOne({ account: normalizedAccount });
  if (!user || user.authProvider !== 'password' || !user.passwordHash) {
    throw UnauthorizedError('账号或密码错误');
  }

  const matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) {
    throw UnauthorizedError('账号或密码错误');
  }

  const session = await buildSessionPayload(user);
  logger.info(`User login: ${user._id}`);

  return session;
};

const updateTagSkin = async (userId, skin) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { tagSkin: skin },
    { new: true }
  ).lean();

  if (!user) {
    throw NotFoundError('User not found');
  }

  return { tagSkin: user.tagSkin };
};

const getPublicProfile = async (requesterId, targetId) => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw BadRequestError('Invalid user id');
  }

  const user = await User.findById(targetId).select('nickname avatar bio').lean();
  if (!user) {
    throw NotFoundError('User not found');
  }

  const ownProfile = requesterId.toString() === targetId;
  let revealed = ownProfile;

  if (!ownProfile) {
    const { Message, RevealDecision } = require('../models');
    const conversationId = Message.generateConversationId(requesterId, targetId);
    const decision = await RevealDecision.findOne({ conversationId }).lean();
    revealed = Boolean(decision?.revealed);
  }

  if (!revealed) {
    const { ForbiddenError } = require('../utils/errors');
    throw ForbiddenError('Profile is locked until both sides reveal identity');
  }

  const { Post } = require('../models');
  const posts = await Post.find({ author: targetId })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return {
    profile: {
      id: targetId,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio
    },
    posts
  };
};

module.exports = {
  normalizeAccount,
  getDefaultAvatar,
  normalizePremium,
  serializeUser,
  buildSessionPayload,
  register,
  login,
  updateTagSkin,
  getPublicProfile
};
