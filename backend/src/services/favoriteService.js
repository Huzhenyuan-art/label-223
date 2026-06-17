const mongoose = require('mongoose');
const { User, Post } = require('../models');
const { NotFoundError, BadRequestError } = require('../utils/errors');

const toObjectId = (value) => new mongoose.Types.ObjectId(value);

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

const toggleFavorite = async (userId, postId) => {
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    throw BadRequestError('Invalid postId');
  }

  const post = await Post.findById(postId);
  if (!post) {
    throw NotFoundError('Post not found');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw NotFoundError('User not found');
  }

  const exists = user.favoritePosts.some((id) => id.toString() === postId);

  if (exists) {
    user.favoritePosts.pull(post._id);
  } else {
    user.favoritePosts.addToSet(post._id);
  }

  await user.save();

  return {
    isFavorited: !exists,
    action: exists ? 'removed' : 'added',
    favoriteCount: user.favoritePosts.length
  };
};

const batchRemoveFavorites = async (userId, postIds) => {
  if (!Array.isArray(postIds) || postIds.length === 0) {
    throw BadRequestError('postIds must be a non-empty array');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw NotFoundError('User not found');
  }

  const idSet = new Set(postIds.map(String));
  user.favoritePosts = user.favoritePosts.filter(
    (id) => !idSet.has(id.toString())
  );
  await user.save();

  return {
    removedCount: idSet.size,
    favoriteCount: user.favoritePosts.length
  };
};

const searchFavorites = async (userId, keyword, tag) => {
  const user = await User.findById(userId)
    .populate({
      path: 'favoritePosts',
      populate: { path: 'author', select: 'nickname avatar' }
    })
    .lean();

  if (!user) {
    throw NotFoundError('User not found');
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

  return {
    posts,
    allTags,
    favoritesByTag
  };
};

module.exports = {
  buildFavoritesByTag,
  toggleFavorite,
  batchRemoveFavorites,
  searchFavorites
};
