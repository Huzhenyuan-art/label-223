const mongoose = require('mongoose');

const recommendationConfigSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    ranking: {
      authoredTagWeight: {
        type: Number,
        default: 3,
        min: 0
      },
      resonatedTagWeight: {
        type: Number,
        default: 2,
        min: 0
      },
      commentedTagWeight: {
        type: Number,
        default: 1,
        min: 0
      },
      resonanceCountWeight: {
        type: Number,
        default: 3,
        min: 0
      },
      commentCountWeight: {
        type: Number,
        default: 2,
        min: 0
      },
      superEchoCountWeight: {
        type: Number,
        default: 4,
        min: 0
      },
      tagMatchWeight: {
        type: Number,
        default: 6,
        min: 0
      },
      recencyWeight: {
        type: Number,
        default: 0.2,
        min: 0
      },
      hotDecayFactor: {
        type: Number,
        default: 1,
        min: 0
      },
      maxTopTags: {
        type: Number,
        default: 10,
        min: 1,
        max: 50
      }
    },
    precompute: {
      enabled: {
        type: Boolean,
        default: true
      },
      intervalMinutes: {
        type: Number,
        default: 30,
        min: 5,
        max: 1440
      },
      maxUsersPerBatch: {
        type: Number,
        default: 100,
        min: 10
      },
      stalenessThresholdHours: {
        type: Number,
        default: 24,
        min: 1
      }
    },
    snapshot: {
      enabled: {
        type: Boolean,
        default: true
      },
      intervals: {
        '1h': {
          type: Boolean,
          default: true
        },
        '6h': {
          type: Boolean,
          default: true
        },
        '24h': {
          type: Boolean,
          default: true
        },
        '7d': {
          type: Boolean,
          default: false
        }
      },
      ttlMinutes: {
        type: Number,
        default: 60,
        min: 5
      },
      maxItems: {
        type: Number,
        default: 200,
        min: 10
      }
    },
    cache: {
      enabled: {
        type: Boolean,
        default: true
      },
      ttlMinutes: {
        type: Number,
        default: 15,
        min: 1
      },
      maxCachedPages: {
        type: Number,
        default: 10,
        min: 1
      },
      maxItemsPerPage: {
        type: Number,
        default: 100,
        min: 10
      }
    },
    hotTags: {
      windowHours: {
        type: Number,
        default: 1,
        min: 1
      },
      fallbackWindowHours: {
        type: Number,
        default: 24,
        min: 1
      },
      maxTags: {
        type: Number,
        default: 12,
        min: 1
      },
      heatBase: {
        type: Number,
        default: 1,
        min: 0
      },
      superEchoHeatMultiplier: {
        type: Number,
        default: 2,
        min: 0
      },
      featuredMaxPosts: {
        type: Number,
        default: 3,
        min: 1,
        max: 10
      }
    }
  },
  {
    timestamps: true
  }
);

recommendationConfigSchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model('RecommendationConfig', recommendationConfigSchema);
