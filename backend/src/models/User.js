const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    openid: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
      trim: true
    },
    account: {
      type: String,
      unique: true,
      index: true,
      sparse: true,
      trim: true,
      lowercase: true
    },
    passwordHash: {
      type: String,
      default: ''
    },
    authProvider: {
      type: String,
      enum: ['password', 'wechat', 'seed'],
      default: 'password'
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    avatar: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    tagSkin: {
      type: String,
      enum: ['ocean', 'sunset', 'mint', 'ink'],
      default: 'ocean'
    },
    favoritePosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post'
      }
    ],
    premium: {
      isActive: { type: Boolean, default: false },
      plan: { type: String, default: '' },
      expireAt: { type: Date }
    },
    lastLoginAt: {
      type: Date,
      default: null
    },
    isAdmin: {
      type: Boolean,
      default: false,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'banned'],
      default: 'active',
      index: true
    },
    bannedAt: {
      type: Date,
      default: null
    },
    bannedReason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);
