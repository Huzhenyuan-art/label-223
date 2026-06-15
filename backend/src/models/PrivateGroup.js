const mongoose = require('mongoose');
const crypto = require('crypto');

const generateInviteCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

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
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        role: {
          type: String,
          enum: ['owner', 'member'],
          default: 'member'
        },
        joinedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    inviteCode: {
      type: String,
      unique: true,
      index: true,
      default: generateInviteCode
    },
    postCount: {
      type: Number,
      default: 0,
      min: 0
    },
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
privateGroupSchema.index({ 'members.user': 1, createdAt: -1 });

privateGroupSchema.methods.isMember = function (userId) {
  return this.members.some(
    (m) => m.user && m.user.toString() === userId.toString()
  );
};

privateGroupSchema.methods.isOwner = function (userId) {
  return this.owner.toString() === userId.toString();
};

privateGroupSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(
    (m) => m.user && m.user.toString() === userId.toString()
  );
  return member ? member.role : null;
};

module.exports = mongoose.model('PrivateGroup', privateGroupSchema);
