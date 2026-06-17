const config = require('../config');

const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sanitizeTags = (tags) => {
  if (!tags) {
    return [];
  }

  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  const normalized = list
    .map((tag) => String(tag).trim().replace(/^[#＃]/, '').toLowerCase())
    .filter(Boolean);

  return [...new Set(normalized)].slice(0, config.maxTagsPerPost);
};

const toObjectId = (value) => {
  const mongoose = require('mongoose');
  return new mongoose.Types.ObjectId(value);
};

const isValidObjectId = (value) => {
  const mongoose = require('mongoose');
  return mongoose.Types.ObjectId.isValid(value);
};

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const isPremiumActive = (premium) => {
  if (!premium || !premium.isActive || !premium.expireAt) {
    return false;
  }
  return new Date(premium.expireAt).getTime() > Date.now();
};

module.exports = {
  escapeRegex,
  sanitizeTags,
  toObjectId,
  isValidObjectId,
  chunkArray,
  isPremiumActive
};
