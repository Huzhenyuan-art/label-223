const configService = require('./configService');
const logger = require('../../utils/logger');

const calculatePostScore = (post, mode, preferredTags, rankingConfig) => {
  const now = Date.now();
  const preferredSet = new Set(preferredTags);
  const {
    resonanceCountWeight,
    commentCountWeight,
    superEchoCountWeight,
    tagMatchWeight,
    recencyWeight,
    hotDecayFactor
  } = rankingConfig;

  const ageHours = Math.max(
    (now - new Date(post.createdAt).getTime()) / 3600000,
    1
  );

  const base =
    post.resonanceCount * resonanceCountWeight +
    post.commentCount * commentCountWeight +
    post.superEchoCount * superEchoCountWeight +
    1;

  const tagMatch = post.tags.reduce(
    (acc, tag) => (preferredSet.has(tag) ? acc + 1 : acc),
    0
  );

  let score = base;

  if (mode === 'recommend') {
    score += tagMatch * tagMatchWeight;
    score += Math.max(0, 24 - ageHours) * recencyWeight;
  } else if (mode === 'hot') {
    score = base / Math.pow(ageHours, hotDecayFactor) + tagMatch;
  }

  return score;
};

const rankPosts = (posts, mode, preferredTags, rankingConfig) => {
  const ranked = posts.map((post) => {
    const score = calculatePostScore(post, mode, preferredTags, rankingConfig);
    return { ...post, score };
  });

  if (mode === 'latest') {
    return ranked.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  return ranked.sort(
    (a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt)
  );
};

const rankPostsWithConfig = async (posts, mode, preferredTags) => {
  const recConfig = await configService.getConfig();
  return rankPosts(posts, mode, preferredTags, recConfig.ranking);
};

module.exports = {
  calculatePostScore,
  rankPosts,
  rankPostsWithConfig
};
