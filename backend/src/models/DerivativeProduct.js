const mongoose = require('mongoose');

const derivativeProductSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['magazine', 'audiobook', 'salon']
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    summary: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240
    },
    coverImage: {
      type: String,
      default: ''
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 20
      }
    ],
    price: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    status: {
      type: String,
      enum: ['published', 'draft'],
      default: 'published'
    }
  },
  {
    timestamps: true
  }
);

derivativeProductSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('DerivativeProduct', derivativeProductSchema);
