const mongoose = require('mongoose');

const paymentOrderSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    plan: {
      type: String,
      required: true,
      enum: ['monthly', 'quarterly', 'yearly']
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending'
    },
    paidAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

paymentOrderSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentOrder', paymentOrderSchema);
