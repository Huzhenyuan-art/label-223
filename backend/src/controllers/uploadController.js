const multer = require('multer');
const config = require('../config');
const { uploadFile, deleteFile } = require('../utils/storage');
const logger = require('../utils/logger');

const memoryStorage = multer.memoryStorage();

const createUpload = (type) => {
  const limits = {
    fileSize: config.storage.maxFileSize[type] || 10 * 1024 * 1024
  };

  const fileFilter = (req, file, cb) => {
    const allowedTypes = config.storage.allowedMimeTypes[type] || [];
    if (allowedTypes.length && !allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
    cb(null, true);
  };

  return multer({
    storage: memoryStorage,
    limits,
    fileFilter
  }).single('file');
};

const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      const type = req.params.type === 'audio' ? '音频' : '图片';
      const maxMb = Math.floor((config.storage.maxFileSize[req.params.type] || 10 * 1024 * 1024) / 1024 / 1024);
      return res.status(400).json({ code: 1, message: `${type}文件过大，最大允许 ${maxMb}MB` });
    }
    return res.status(400).json({ code: 1, message: `上传错误: ${error.message}` });
  }
  if (error) {
    return res.status(400).json({ code: 1, message: error.message });
  }
  next();
};

const wrapUploadMiddleware = (type) => {
  const upload = createUpload(type);
  return (req, res, next) => {
    upload(req, res, (err) => handleUploadError(err, req, res, next));
  };
};

exports.uploadImageMiddleware = wrapUploadMiddleware('image');
exports.uploadAudioMiddleware = wrapUploadMiddleware('audio');

exports.uploadMedia = async (req, res) => {
  try {
    const type = req.params.type;

    if (!req.file) {
      return res.status(400).json({ code: 1, message: '请选择要上传的文件' });
    }

    const result = await uploadFile(req.file, type);

    logger.info(`Media uploaded: type=${type}, url=${result.url}, size=${result.size}, user=${req.userId}`);

    return res.json({
      code: 0,
      data: {
        url: result.url,
        fileName: result.fileName,
        size: result.size,
        mimeType: result.mimeType
      }
    });
  } catch (error) {
    logger.error(`Upload media error: ${error.message}`);
    return res.status(400).json({ code: 1, message: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ code: 1, message: '请提供要删除的文件URL' });
    }

    await deleteFile(url);

    logger.info(`Media deleted: url=${url}, user=${req.userId}`);

    return res.json({
      code: 0,
      data: { message: '删除成功' }
    });
  } catch (error) {
    logger.error(`Delete media error: ${error.message}`);
    return res.status(500).json({ code: 1, message: '删除失败，请稍后重试' });
  }
};
