const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Post, Resonance, Comment, Message, RevealDecision } = require('../models');
const logger = require('../utils/logger');
const { signToken } = require('../utils/auth');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);
const DEFAULT_AVATARS = [
  'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=200',
  'https://images.pexels.com/photos/1704488/pexels-photo-1704488.jpeg?auto=compress&cs=tinysrgb&w=200'
];

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

const normalizeAccount = (value) => String(value || '').trim().toLowerCase();
const getDefaultAvatar = (seed) => {
  const total = [...String(seed || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DEFAULT_AVATARS[total % DEFAULT_AVATARS.length];
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

const buildInterestMap = async (userId) => {
  const objectId = toObjectId(userId);

  const [authoredTags, resonatedTags, commentedTags, favoritedTags] = await Promise.all([
    Post.aggregate([
      { $match: { author: objectId } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', score: { $sum: 3 } } }
    ]),
    Resonance.aggregate([
      { $match: { user: objectId } },
      {
        $lookup: {
          from: 'posts',
          localField: 'post',
          foreignField: '_id',
          as: 'postDoc'
        }
      },
      { $unwind: '$postDoc' },
      { $unwind: '$postDoc.tags' },
      { $group: { _id: '$postDoc.tags', score: { $sum: 2 } } }
    ]),
    Comment.aggregate([
      { $match: { user: objectId } },
      {
        $lookup: {
          from: 'posts',
          localField: 'post',
          foreignField: '_id',
          as: 'postDoc'
        }
      },
      { $unwind: '$postDoc' },
      { $unwind: '$postDoc.tags' },
      { $group: { _id: '$postDoc.tags', score: { $sum: 1 } } }
    ]),
    (async () => {
      const user = await User.findById(userId).select('favoritePosts').lean();
      if (!user || !user.favoritePosts || user.favoritePosts.length === 0) return [];
      return Post.aggregate([
        { $match: { _id: { $in: user.favoritePosts.map(id => toObjectId(id.toString())) } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', score: { $sum: 1 } } }
      ]);
    })()
  ]);

  const map = new Map();

  [authoredTags, resonatedTags, commentedTags, favoritedTags].forEach((entries) => {
    entries.forEach((item) => {
      map.set(item._id, (map.get(item._id) || 0) + item.score);
    });
  });

  return [...map.entries()]
    .map(([tag, score]) => ({ tag, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
};

const buildFavoritesByTag = async (userId) => {
  const user = await User.findById(userId)
    .populate({
      path: 'favoritePosts',
      populate: { path: 'author', select: 'nickname avatar' }
    })
    .lean();

  if (!user) {
    return [];
  }

  const groups = new Map();
  (user.favoritePosts || []).forEach((post) => {
    const key = post.tags?.[0] || '未分类';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(post);
  });

  return [...groups.entries()]
    .map(([tag, posts]) => ({ tag, count: posts.length, posts }))
    .sort((a, b) => b.count - a.count);
};

exports.register = async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const account = normalizeAccount(req.body.account);
    const password = String(req.body.password || '');

    const existing = await User.findOne({ account }).select('_id').lean();
    if (existing) {
      return res.status(409).json({ code: 1, message: '账号已被占用，请更换后重试' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      openid: `acct:${account}`,
      account,
      passwordHash,
      authProvider: 'password',
      nickname,
      avatar: getDefaultAvatar(account),
      bio: '在回声岛留下第一条真实回声。'
    });

    const session = await buildSessionPayload(user);
    logger.info(`User registered: ${user._id}`);

    return res.status(201).json({
      code: 0,
      data: session
    });
  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const account = normalizeAccount(req.body.account);
    const password = String(req.body.password || '');

    const user = await User.findOne({ account });
    if (!user || user.authProvider !== 'password' || !user.passwordHash) {
      return res.status(401).json({ code: 1, message: '账号或密码错误' });
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      return res.status(401).json({ code: 1, message: '账号或密码错误' });
    }

    const session = await buildSessionPayload(user);
    logger.info(`User login: ${user._id}`);

    return res.json({
      code: 0,
      data: session
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getIsland = async (req, res) => {
  try {
    const userId = req.userId;

    const [user, authoredCount, resonanceReceivedAgg, commentCount, superEchoCount, interestMap, favoritesByTag] =
      await Promise.all([
        User.findById(userId).lean(),
        Post.countDocuments({ author: userId }),
        Post.aggregate([
          { $match: { author: toObjectId(userId) } },
          { $group: { _id: null, total: { $sum: '$resonanceCount' } } }
        ]),
        Comment.countDocuments({ user: userId }),
        Post.countDocuments({ author: userId, type: 'super_echo' }),
        buildInterestMap(userId),
        buildFavoritesByTag(userId)
      ]);

    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const resonanceReceived = resonanceReceivedAgg[0]?.total || 0;
    const resonanceIndex = resonanceReceived * 4 + commentCount * 2 + superEchoCount * 3;

    const premium = normalizePremium(user.premium);

    return res.json({
      code: 0,
      data: {
        profile: {
          id: user._id,
          nickname: user.nickname,
          avatar: user.avatar,
          bio: user.bio,
          tagSkin: user.tagSkin,
          premium
        },
        metrics: {
          resonanceIndex,
          resonanceReceived,
          authoredCount,
          commentCount,
          superEchoCount
        },
        interestMap,
        favoritesByTag
      }
    });
  } catch (error) {
    logger.error(`Get island error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.toggleFavorite = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ code: 1, message: 'Invalid postId' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ code: 1, message: 'Post not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const exists = user.favoritePosts.some((id) => id.toString() === postId);

    if (exists) {
      user.favoritePosts.pull(post._id);
    } else {
      user.favoritePosts.addToSet(post._id);
    }

    await user.save();

    return res.json({
      code: 0,
      data: {
        isFavorited: !exists,
        action: exists ? 'removed' : 'added',
        favoriteCount: user.favoritePosts.length
      }
    });
  } catch (error) {
    logger.error(`Toggle favorite error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getFavoritesByTag = async (req, res) => {
  try {
    const groups = await buildFavoritesByTag(req.userId);
    return res.json({ code: 0, data: groups });
  } catch (error) {
    logger.error(`Get favorites by tag error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.batchRemoveFavorites = async (req, res) => {
  try {
    const { postIds } = req.body;
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({ code: 1, message: 'postIds must be a non-empty array' });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const idSet = new Set(postIds.map(String));
    user.favoritePosts = user.favoritePosts.filter(
      (id) => !idSet.has(id.toString())
    );
    await user.save();

    return res.json({
      code: 0,
      data: {
        removedCount: idSet.size,
        favoriteCount: user.favoritePosts.length
      }
    });
  } catch (error) {
    logger.error(`Batch remove favorites error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.searchFavorites = async (req, res) => {
  try {
    const { keyword, tag } = req.query;
    const userId = req.userId;

    const user = await User.findById(userId)
      .populate({
        path: 'favoritePosts',
        populate: { path: 'author', select: 'nickname avatar' }
      })
      .lean();

    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    let posts = user.favoritePosts || [];

    if (tag) {
      posts = posts.filter((post) =>
        (post.tags || []).some((t) => t.toLowerCase() === tag.toLowerCase())
      );
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      posts = posts.filter((post) =>
        (post.title || '').toLowerCase().includes(kw) ||
        (post.contentText || '').toLowerCase().includes(kw) ||
        (post.dynamicTag || '').toLowerCase().includes(kw)
      );
    }

    const allTags = [...new Set((user.favoritePosts || []).flatMap((p) => p.tags || []))];

    const groups = new Map();
    posts.forEach((post) => {
      const key = post.tags?.[0] || '未分类';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(post);
    });

    const favoritesByTag = [...groups.entries()]
      .map(([t, p]) => ({ tag: t, count: p.length, posts: p }))
      .sort((a, b) => b.count - a.count);

    return res.json({
      code: 0,
      data: {
        posts,
        allTags,
        favoritesByTag
      }
    });
  } catch (error) {
    logger.error(`Search favorites error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getPublicProfile = async (req, res) => {
  try {
    const requesterId = req.userId.toString();
    const targetId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ code: 1, message: 'Invalid user id' });
    }

    const user = await User.findById(targetId).select('nickname avatar bio').lean();
    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    const ownProfile = requesterId === targetId;
    let revealed = ownProfile;

    if (!ownProfile) {
      const conversationId = Message.generateConversationId(requesterId, targetId);
      const decision = await RevealDecision.findOne({ conversationId }).lean();
      revealed = Boolean(decision?.revealed);
    }

    if (!revealed) {
      return res.status(403).json({
        code: 1,
        message: 'Profile is locked until both sides reveal identity'
      });
    }

    const posts = await Post.find({ author: targetId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      code: 0,
      data: {
        profile: {
          id: targetId,
          nickname: user.nickname,
          avatar: user.avatar,
          bio: user.bio
        },
        posts
      }
    });
  } catch (error) {
    logger.error(`Get public profile error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.getInsightReport = async (req, res) => {
  try {
    const userId = req.userId;
    const objectId = toObjectId(userId);
    const since = new Date(Date.now() - 30 * 24 * 3600000);

    const [postCount30d, resonanceGiven30d, commentGiven30d, resonanceReceivedAgg, trend, topTags] = await Promise.all([
      Post.countDocuments({ author: userId, createdAt: { $gte: since } }),
      Resonance.countDocuments({ user: userId, createdAt: { $gte: since } }),
      Comment.countDocuments({ user: userId, createdAt: { $gte: since } }),
      Resonance.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $lookup: {
            from: 'posts',
            localField: 'post',
            foreignField: '_id',
            as: 'postDoc'
          }
        },
        { $unwind: '$postDoc' },
        { $match: { 'postDoc.author': objectId } },
        { $group: { _id: null, count: { $sum: 1 } } }
      ]),
      Post.aggregate([
        { $match: { author: objectId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      buildInterestMap(userId)
    ]);

    return res.json({
      code: 0,
      data: {
        period: '30d',
        summary: {
          postCount30d,
          resonanceGiven30d,
          resonanceReceived30d: resonanceReceivedAgg[0]?.count || 0,
          commentGiven30d
        },
        topTags: topTags.slice(0, 8),
        trend
      }
    });
  } catch (error) {
    logger.error(`Get insight report error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};

exports.updateTagSkin = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      { tagSkin: req.body.skin },
      { new: true }
    ).lean();

    if (!user) {
      return res.status(404).json({ code: 1, message: 'User not found' });
    }

    return res.json({
      code: 0,
      data: {
        tagSkin: user.tagSkin
      }
    });
  } catch (error) {
    logger.error(`Update tag skin error: ${error.message}`);
    return res.status(500).json({ code: 1, message: 'Server error' });
  }
};


