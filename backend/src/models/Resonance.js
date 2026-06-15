const mongoose = require('mongoose');

const resonanceSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

resonanceSchema.index({ post: 1, user: 1 }, { unique: true });
resonanceSchema.index({ post: 1, createdAt: -1 });
resonanceSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Resonance', resonanceSchema);
