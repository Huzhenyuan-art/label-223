const configService = require('./configService');
const logger = require('../../utils/logger');

const ONE_HOUR_MS = 3600000;

const _calculatePostScoreFast = (post, mode, preferredTagSet, rankingConfig, now) => {
  const {
    resonanceCountWeight,
    commentCountWeight,
    superEchoCountWeight,
    tagMatchWeight,
    recencyWeight,
    hotDecayFactor
  } = rankingConfig;

  const ageHours = Math.max(
    (now - post.createdAt.getTime()) / ONE_HOUR_MS,
    1
  );

  const baseScore =
    (post.resonanceCount || 0) * resonanceCountWeight +
    (post.commentCount || 0) * commentCountWeight +
    (post.superEchoCount || 0) * superEchoCountWeight +
    1;

  let tagMatchScore = 0;
  if (preferredTagSet.size > 0) {
    const tags = post.tags || [];
    for (let i = 0; i < tags.length; i++) {
      if (preferredTagSet.has(tags[i])) {
        tagMatchScore++;
      }
    }
  }

  let score = baseScore;

  if (mode === 'recommend') {
    score += tagMatchScore * tagMatchWeight;
    score += Math.max(0, 24 - ageHours) * recencyWeight;
  } else if (mode === 'hot') {
    score = baseScore / Math.pow(ageHours, hotDecayFactor) + tagMatchScore;
  }

  return score;
};

const calculatePostScore = (post, mode, preferredTags, rankingConfig) => {
  const now = Date.now();
  const preferredTagSet = new Set(preferredTags || []);
  return _calculatePostScoreFast(post, mode, preferredTagSet, rankingConfig, now);
};

const rankPosts = (posts, mode, preferredTags, rankingConfig) => {
  const now = Date.now();
  const preferredTagSet = new Set(preferredTags || []);

  const scoredPosts = new Array(posts.length);
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const score = _calculatePostScoreFast(post, mode, preferredTagSet, rankingConfig, now);
    scoredPosts[i] = { ...post, score };
  }

  if (mode === 'latest') {
    return scoredPosts.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  return scoredPosts.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
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
