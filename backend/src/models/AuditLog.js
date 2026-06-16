const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['post', 'super_echo', 'comment', 'comment_reply', 'message'],
      required: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    fields: [
      {
        type: String
      }
    ],
    matchedWords: [
      {
        word: String,
        category: String,
        level: Number
      }
    ],
    action: {
      type: String,
      enum: ['blocked', 'masked', 'passed'],
      required: true
    },
    maskedContent: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 2592000
    }
  },
  {
    timestamps: false
  }
);

auditLogSchema.index({ type: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
