const mongoose = require('mongoose');

const sensitiveWordSchema = new mongoose.Schema(
  {
    word: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      maxlength: 50
    },
    category: {
      type: String,
      enum: ['politics', 'violence', 'pornography', 'advertising', 'insult', 'other'],
      default: 'other'
    },
    level: {
      type: Number,
      enum: [1, 2, 3],
      default: 2
    },
    enabled: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

sensitiveWordSchema.index({ word: 1 });
sensitiveWordSchema.index({ category: 1, enabled: 1 });

module.exports = mongoose.model('SensitiveWord', sensitiveWordSchema);
