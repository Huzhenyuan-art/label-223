const mongoose = require('mongoose');

const derivativeWaitlistSchema = new mongoose.Schema(
  {
    derivative: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DerivativeProduct',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'contacted'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

derivativeWaitlistSchema.index({ derivative: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('DerivativeWaitlist', derivativeWaitlistSchema);
