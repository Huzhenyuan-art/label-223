const { RecommendationConfig } = require('../../models');
const config = require('../../config');
const logger = require('../../utils/logger');

const DEFAULT_CONFIG = {
  name: 'default',
  description: 'Default recommendation configuration',
  isActive: true,
  ranking: {
    authoredTagWeight: 3,
    resonatedTagWeight: 2,
    commentedTagWeight: 1,
    resonanceCountWeight: 3,
    commentCountWeight: 2,
    superEchoCountWeight: 4,
    tagMatchWeight: 6,
    recencyWeight: 0.2,
    hotDecayFactor: 1,
    maxTopTags: 10
  },
  precompute: {
    enabled: true,
    intervalMinutes: 30,
    maxUsersPerBatch: 100,
    stalenessThresholdHours: 24
  },
  snapshot: {
    enabled: true,
    intervals: {
      '1h': true,
      '6h': true,
      '24h': true,
      '7d': false
    },
    ttlMinutes: 60,
    maxItems: 200
  },
  cache: {
    enabled: true,
    ttlMinutes: 15,
    maxCachedPages: 10,
    maxItemsPerPage: 100
  },
  hotTags: {
    windowHours: 1,
    fallbackWindowHours: 24,
    maxTags: 12,
    heatBase: 1,
    superEchoHeatMultiplier: 2,
    featuredMaxPosts: 3
  }
};

let activeConfig = null;
let configLoadTime = 0;
const CONFIG_CACHE_TTL = 60000;

const deepMerge = (target, source) => {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

const loadActiveConfig = async () => {
  try {
    const now = Date.now();
    if (activeConfig && now - configLoadTime < CONFIG_CACHE_TTL) {
      return activeConfig;
    }

    const configName = config.recommendation.defaultConfigName;
    let dbConfig = await RecommendationConfig.findOne({
      name: configName,
      isActive: true
    }).lean();

    if (!dbConfig) {
      logger.info(`[RecommendationConfig] Creating default config: ${configName}`);
      dbConfig = await RecommendationConfig.create(DEFAULT_CONFIG);
      dbConfig = dbConfig.toObject();
    }

    activeConfig = deepMerge(DEFAULT_CONFIG, dbConfig);
    configLoadTime = now;

    logger.info(`[RecommendationConfig] Loaded config: ${configName}`);
    return activeConfig;
  } catch (error) {
    logger.error(`[RecommendationConfig] Load error: ${error.message}`);
    return deepMerge(DEFAULT_CONFIG, {});
  }
};

const getConfig = async () => {
  if (!activeConfig) {
    await loadActiveConfig();
  }
  return activeConfig || DEFAULT_CONFIG;
};

const updateConfig = async (name, updates) => {
  try {
    const updated = await RecommendationConfig.findOneAndUpdate(
      { name },
      { $set: updates },
      { new: true, upsert: true }
    ).lean();

    activeConfig = deepMerge(DEFAULT_CONFIG, updated);
    configLoadTime = Date.now();

    logger.info(`[RecommendationConfig] Updated config: ${name}`);
    return activeConfig;
  } catch (error) {
    logger.error(`[RecommendationConfig] Update error: ${error.message}`);
    throw error;
  }
};

const invalidateCache = () => {
  activeConfig = null;
  configLoadTime = 0;
  logger.info('[RecommendationConfig] Cache invalidated');
};

module.exports = {
  getConfig,
  loadActiveConfig,
  updateConfig,
  invalidateCache,
  DEFAULT_CONFIG
};
