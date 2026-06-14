const mongoose = require('mongoose');

const brandCampSchema = new mongoose.Schema(
  {
    organization: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    theme: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 280
    },
    cycleFee: {
      type: Number,
      required: true,
      min: 0
    },
    cycle: {
      type: String,
      required: true,
      enum: ['weekly', 'monthly', 'quarterly']
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 20
      }
    ],
    status: {
      type: String,
      enum: ['online', 'paused'],
      default: 'online'
    }
  },
  {
    timestamps: true
  }
);

brandCampSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('BrandCamp', brandCampSchema);
