const mongoose = require('mongoose');

const revealDecisionSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    agreedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    revealed: {
      type: Boolean,
      default: false
    },
    unlockedAt: {
      type: Date,
      default: null
    },
    tempNicknames: {
      type: Map,
      of: String,
      default: () => new Map()
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('RevealDecision', revealDecisionSchema);
