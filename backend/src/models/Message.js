const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sourcePost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    senderDynamicTag: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
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

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

messageSchema.statics.generateConversationId = function generateConversationId(userIdA, userIdB) {
  const [a, b] = [userIdA.toString(), userIdB.toString()].sort();
  return `${a}_${b}`;
};

module.exports = mongoose.model('Message', messageSchema);
