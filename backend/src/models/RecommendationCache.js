const mongoose = require('mongoose');

const recommendationCacheSchema = new mongoose.Schema(
  {
    cacheKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    mode: {
      type: String,
      enum: ['recommend', 'hot', 'latest'],
      required: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    keyword: {
      type: String,
      trim: true
    },
    page: {
      type: Number,
      required: true,
      min: 1
    },
    limit: {
      type: Number,
      required: true,
      min: 1
    },
    total: {
      type: Number,
      required: true,
      min: 0
    },
    pages: {
      type: Number,
      required: true,
      min: 0
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true
      }
    ],
    itemScores: [
      {
        postId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Post',
          required: true
        },
        score: {
          type: Number,
          required: true
        }
      }
    ],
    preferredTags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    createdAt: {
      type: Date,
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

recommendationCacheSchema.index({ mode: 1, user: 1, page: 1, createdAt: -1 });
recommendationCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RecommendationCache', recommendationCacheSchema);
