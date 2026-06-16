const mongoose = require('mongoose');

const resonanceNotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },
    superEcho: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    read: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

resonanceNotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
resonanceNotificationSchema.index({ post: 1, createdAt: -1 });

module.exports = mongoose.model('ResonanceNotification', resonanceNotificationSchema);
