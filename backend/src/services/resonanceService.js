const { Resonance, Post } = require('../models');
const logger = require('../utils/logger');
const { BadRequestError, NotFoundError } = require('../utils/errors');
const { isValidObjectId } = require('../utils/common');
const notificationService = require('./notificationService');

const toggleResonance = async ({ postId, userId }) => {
  if (!isValidObjectId(postId)) {
    throw BadRequestError('Invalid post id');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  const exists = await Resonance.findOne({ post: postId, user: userId });

  if (exists) {
    await Resonance.deleteOne({ _id: exists._id });
    await Post.findByIdAndUpdate(postId, { $inc: { resonanceCount: -1 } });
    return {
      resonated: false,
      resonanceCount: Math.max((post.resonanceCount || 0) - 1, 0)
    };
  }

  await Resonance.create({ post: postId, user: userId });
  await Post.findByIdAndUpdate(postId, { $inc: { resonanceCount: 1 } });

  if (post.author.toString() !== userId.toString()) {
    notificationService.createResonanceNotification(
      post.author,
      userId,
      post._id,
      ''
    ).catch((e) => logger.error(`Create resonance notification error: ${e.message}`));
  }

  return {
    resonated: true,
    resonanceCount: (post.resonanceCount || 0) + 1
  };
};

module.exports = {
  toggleResonance
};
