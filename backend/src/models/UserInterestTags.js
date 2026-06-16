const mongoose = require('mongoose');

const userInterestTagsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    tags: [
      {
        tag: {
          type: String,
          required: true,
          trim: true,
          lowercase: true
        },
        score: {
          type: Number,
          required: true,
          min: 0
        },
        source: {
          type: String,
          enum: ['authored', 'resonated', 'commented'],
          required: true
        }
      }
    ],
    topTags: [
      {
        type: String,
        trim: true,
        lowercase: true
      }
    ],
    lastComputedAt: {
      type: Date,
      required: true
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true
  }
);

userInterestTagsSchema.index({ user: 1, lastComputedAt: -1 });

module.exports = mongoose.model('UserInterestTags', userInterestTagsSchema);
