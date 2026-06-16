const mongoose = require('mongoose');

const userTagSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tag: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 20
    },
    subscribedAt: {
      type: Date,
      default: Date.now
    },
    lastViewedAt: {
      type: Date,
      default: null
    },
    unreadCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastNotifiedPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    }
  },
  {
    timestamps: true
  }
);

userTagSubscriptionSchema.index({ user: 1, tag: 1 }, { unique: true });
userTagSubscriptionSchema.index({ user: 1, subscribedAt: -1 });

module.exports = mongoose.model('UserTagSubscription', userTagSubscriptionSchema);
