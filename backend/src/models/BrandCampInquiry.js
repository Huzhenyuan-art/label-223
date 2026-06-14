const mongoose = require('mongoose');

const brandCampInquirySchema = new mongoose.Schema(
  {
    camp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BrandCamp',
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

brandCampInquirySchema.index({ camp: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('BrandCampInquiry', brandCampInquirySchema);
