const mongoose = require('mongoose');

const privateGroupPostSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PrivateGroup',
      required: true,
      index: true
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ''
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    images: [
      {
        type: String,
        trim: true,
        maxlength: 500
      }
    ],
    commentCount: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

privateGroupPostSchema.index({ group: 1, createdAt: -1 });
privateGroupPostSchema.index({ author: 1, createdAt: -1 });

module.exports = mongoose.model('PrivateGroupPost', privateGroupPostSchema);
