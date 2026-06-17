const { Resonance, User } = require('../models');
const { isPremiumActive } = require('./common');

const attachInteractionState = async (posts, userId) => {
  if (!userId || !posts.length) {
    return {
      list: posts.map((post) => ({
        ...post,
        isResonated: false,
        isFavorited: false
      })),
      viewerPremium: false
    };
  }

  const ids = posts.map((item) => item._id);

  const [resonances, user] = await Promise.all([
    Resonance.find({ user: userId, post: { $in: ids } })
      .select('post')
      .lean(),
    User.findById(userId).select('favoritePosts premium').lean()
  ]);

  const resonanceSet = new Set(
    resonances.map((item) => item.post.toString())
  );
  const favoriteSet = new Set(
    (user?.favoritePosts || []).map((item) => item.toString())
  );

  const viewerPremium = isPremiumActive(user?.premium);

  return {
    list: posts.map((post) => ({
      ...post,
      isResonated: resonanceSet.has(post._id.toString()),
      isFavorited: favoriteSet.has(post._id.toString())
    })),
    viewerPremium
  };
};

module.exports = {
  attachInteractionState
};
