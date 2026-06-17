const mongoose = require('mongoose');
const {
  User,
  Post,
  Resonance,
  Comment,
  ResonanceNotification
} = require('../models');
const { NotFoundError } = require('../utils/errors');
const { normalizePremium } = require('./userService');
const favoriteService = require('./favoriteService');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

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

const getIsland = async (userId) => {
  const [
    user,
    authoredCount,
    resonanceReceivedAgg,
    commentCount,
    superEchoCount,
    interestMap,
    favoritesByTag,
    unreadResonanceNotificationCount
  ] = await Promise.all([
    User.findById(userId).lean(),
    Post.countDocuments({ author: userId }),
    Post.aggregate([
      { $match: { author: toObjectId(userId) } },
      { $group: { _id: null, total: { $sum: '$resonanceCount' } } }
    ]),
    Comment.countDocuments({ user: userId }),
    Post.countDocuments({ author: userId, type: 'super_echo' }),
    buildInterestMap(userId),
    favoriteService.buildFavoritesByTag(userId),
    ResonanceNotification.countDocuments({ recipient: userId, read: false })
  ]);

  if (!user) {
    throw NotFoundError('User not found');
  }

  const resonanceReceived = resonanceReceivedAgg[0]?.total || 0;
  const resonanceIndex = resonanceReceived * 4 + commentCount * 2 + superEchoCount * 3;

  const premium = normalizePremium(user.premium);

  return {
    profile: {
      id: user._id,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio,
      tagSkin: user.tagSkin,
      premium,
      isAdmin: user.isAdmin || false
    },
    metrics: {
      resonanceIndex,
      resonanceReceived,
      authoredCount,
      commentCount,
      superEchoCount
    },
    unreadResonanceNotificationCount,
    interestMap,
    favoritesByTag
  };
};

module.exports = {
  buildInterestMap,
  getIsland
};
