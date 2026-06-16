const mongoose = require('mongoose');

const hotListSnapshotSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['posts', 'tags'],
      required: true,
      index: true
    },
    window: {
      type: String,
      enum: ['1h', '6h', '24h', '7d'],
      required: true,
      index: true
    },
    items: [
      {
        rank: {
          type: Number,
          required: true,
          min: 1
        },
        itemId: {
          type: mongoose.Schema.Types.ObjectId,
          refPath: 'itemRef',
          required: true
        },
        itemRef: {
          type: String,
          required: true,
          enum: ['Post', 'Tag']
        },
        score: {
          type: Number,
          required: true,
          min: 0
        },
        heat: {
          type: Number,
          required: true,
          min: 0
        },
        tag: {
          type: String,
          trim: true,
          lowercase: true
        },
        postCount: {
          type: Number,
          default: 0,
          min: 0
        }
      }
    ],
    snapshotAt: {
      type: Date,
      required: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    totalItems: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

hotListSnapshotSchema.index({ type: 1, window: 1, snapshotAt: -1 });
hotListSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('HotListSnapshot', hotListSnapshotSchema);
