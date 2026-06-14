const mongoose = require('mongoose');

const privateGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    theme: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
      default: ''
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

privateGroupSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('PrivateGroup', privateGroupSchema);
