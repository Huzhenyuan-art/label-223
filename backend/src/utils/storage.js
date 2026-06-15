const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const logger = require('./logger');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const generateFileName = (originalName) => {
  const ext = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${random}${ext}`;
};

const getSubDirByType = (type) => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${type}/${yyyy}/${mm}`;
};

const saveToLocal = async (file, type) => {
  const baseDir = path.resolve(process.cwd(), config.storage.local.uploadDir);
  const subDir = getSubDirByType(type);
  const fullDir = path.join(baseDir, subDir);

  ensureDir(fullDir);

  const fileName = generateFileName(file.originalname);
  const filePath = path.join(fullDir, fileName);

  fs.writeFileSync(filePath, file.buffer);

  const publicBaseUrl = config.storage.local.publicBaseUrl.replace(/\/$/, '');
  const fileUrl = `${publicBaseUrl}/${subDir}/${fileName}`;

  return {
    url: fileUrl,
    fileName,
    size: file.size,
    mimeType: file.mimetype,
    storagePath: filePath
  };
};

const uploadFile = async (file, type = 'image') => {
  if (!file) {
    throw new Error('No file provided');
  }

  const allowedTypes = config.storage.allowedMimeTypes[type] || [];
  if (allowedTypes.length && !allowedTypes.includes(file.mimetype)) {
    throw new Error(`Unsupported file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`);
  }

  const maxSize = config.storage.maxFileSize[type] || 10 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`File too large. Max size: ${Math.floor(maxSize / 1024 / 1024)}MB`);
  }

  const provider = config.storage.provider;

  switch (provider) {
    case 'local':
      return await saveToLocal(file, type);
    case 'aliyun':
    case 'tencent':
    case 'aws':
      logger.warn(`Storage provider '${provider}' not fully implemented yet, falling back to local storage`);
      return await saveToLocal(file, type);
    default:
      return await saveToLocal(file, type);
  }
};

const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

  try {
    const baseDir = path.resolve(process.cwd(), config.storage.local.uploadDir);
    const publicBaseUrl = config.storage.local.publicBaseUrl.replace(/\/$/, '');
    const relativePath = fileUrl.replace(publicBaseUrl + '/', '');
    const filePath = path.join(baseDir, relativePath);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Delete file error: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  ensureDir
};
