const mongoose = require('mongoose');
const { Post, Resonance, Comment } = require('../models');
const { buildInterestMap } = require('./islandService');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

const getInsightReport = async (userId) => {
  const objectId = toObjectId(userId);
  const since = new Date(Date.now() - 30 * 24 * 3600000);

  const [
    postCount30d,
    resonanceGiven30d,
    commentGiven30d,
    resonanceReceivedAgg,
    trend,
    topTags
  ] = await Promise.all([
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

  return {
    period: '30d',
    summary: {
      postCount30d,
      resonanceGiven30d,
      resonanceReceived30d: resonanceReceivedAgg[0]?.count || 0,
      commentGiven30d
    },
    topTags: topTags.slice(0, 8),
    trend
  };
};

module.exports = {
  getInsightReport
};
