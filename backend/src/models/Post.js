const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ''
    },
    contentText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    contentAudio: {
      type: String,
      default: ''
    },
    contentLink: {
      type: String,
      default: ''
    },
    coverImage: {
      type: String,
      default: ''
    },
    dynamicTag: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24
    },
    tags: [
      {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 20
      }
    ],
    type: {
      type: String,
      enum: ['origin', 'super_echo'],
      default: 'origin'
    },
    parentPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    resonanceCount: {
      type: Number,
      default: 0,
      min: 0
    },
    commentCount: {
      type: Number,
      default: 0,
      min: 0
    },
    superEchoCount: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      enum: ['published', 'removed'],
      default: 'published',
      index: true
    },
    removedAt: {
      type: Date,
      default: null
    },
    removedReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    removedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ tags: 1, createdAt: -1 });
postSchema.index({ parentPost: 1, createdAt: 1 });
postSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
