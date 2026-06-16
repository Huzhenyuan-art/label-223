const mongoose = require('mongoose');

const tagChannelSchema = new mongoose.Schema(
  {
    tag: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
      maxlength: 20
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 24,
      default: ''
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    coverImage: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      default: 'general'
    },
    subscriberCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true
    },
    postCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lastPostAt: {
      type: Date,
      default: null
    },
    isOfficial: {
      type: Boolean,
      default: false
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

tagChannelSchema.index({ isActive: 1, sortOrder: 1, subscriberCount: -1 });

module.exports = mongoose.model('TagChannel', tagChannelSchema);
