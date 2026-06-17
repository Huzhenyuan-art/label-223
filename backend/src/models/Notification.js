const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ['resonance', 'comment', 'super_echo', 'reveal_request', 'reveal_success'],
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderDynamicTag: {
      type: String,
      default: '',
      trim: true,
      maxlength: 24
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null
    },
    superEcho: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    conversationId: {
      type: String,
      default: '',
      index: true
    },
    content: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    },
    extra: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
