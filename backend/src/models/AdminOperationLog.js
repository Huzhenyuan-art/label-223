const mongoose = require('mongoose');

const adminOperationLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    adminName: {
      type: String,
      required: true,
      trim: true
    },
    module: {
      type: String,
      required: true,
      enum: ['user', 'post', 'message', 'order', 'camp_inquiry', 'sensitive_word', 'system'],
      index: true
    },
    action: {
      type: String,
      required: true,
      trim: true
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    targetType: {
      type: String,
      default: '',
      trim: true
    },
    detail: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: '',
      trim: true
    },
    userAgent: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

adminOperationLogSchema.index({ createdAt: -1 });
adminOperationLogSchema.index({ module: 1, createdAt: -1 });

module.exports = mongoose.model('AdminOperationLog', adminOperationLogSchema);
