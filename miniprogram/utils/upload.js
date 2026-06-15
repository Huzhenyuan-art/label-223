const request = require('./request');
const config = require('../config/index');
const { ensureLogin } = require('./util');

const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
};

const chooseImage = (options = {}) => {
  const {
    count = 1,
    sizeType = ['compressed'],
    sourceType = ['album', 'camera']
  } = options;

  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sizeType,
      sourceType,
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          resolve(res.tempFiles.map((file) => ({
            tempFilePath: file.tempFilePath,
            size: file.size,
            duration: file.duration
          })));
        } else {
          reject(new Error('未选择图片'));
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          reject(new Error('已取消选择'));
        } else {
          reject(err);
        }
      }
    });
  });
};

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'aac', 'm4a'];

const isAudioFile = (fileName) => {
  if (!fileName) return false;
  const ext = fileName.split('.').pop().toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
};

const chooseAudio = () => {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: AUDIO_EXTENSIONS,
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const file = res.tempFiles[0];

          if (!isAudioFile(file.name)) {
            wx.showToast({
              title: '请选择音频文件（mp3/wav/ogg/aac/m4a）',
              icon: 'none',
              duration: 2500
            });
            reject(new Error('文件类型不支持'));
            return;
          }

          resolve([{
            tempFilePath: file.path,
            size: file.size,
            name: file.name
          }]);
        } else {
          reject(new Error('未选择音频文件'));
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          reject(new Error('已取消选择'));
        } else {
          reject(err);
        }
      }
    });
  });
};

const doUpload = (apiPath, tempFilePath, onProgress) => {
  if (!ensureLogin({ showToast: true, redirect: false })) {
    return Promise.reject(new Error('请先登录'));
  }

  return new Promise((resolve, reject) => {
    const uploadTask = wx.uploadFile({
      url: config.BASE_URL + apiPath,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: wx.getStorageSync('authToken') ? `Bearer ${wx.getStorageSync('authToken')}` : ''
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300 && data.code === 0) {
            if (onProgress && typeof onProgress === 'function') {
              onProgress({ progress: 100, done: true, result: data.data });
            }
            resolve(data.data);
          } else {
            const message = data?.message || '上传失败';
            wx.showToast({ title: message, icon: 'none' });
            reject(new Error(message));
          }
        } catch (e) {
          wx.showToast({ title: '响应解析失败', icon: 'none' });
          reject(new Error('响应解析失败'));
        }
      },
      fail: () => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject(new Error('网络连接失败'));
      }
    });

    if (onProgress && typeof onProgress === 'function') {
      uploadTask.onProgressUpdate((res) => {
        onProgress({
          progress: res.progress,
          totalBytesSent: res.totalBytesSent,
          totalBytesExpectedToSend: res.totalBytesExpectedToSend,
          done: false
        });
      });
    }
  });
};

const uploadImage = (tempFilePath, onProgress) => doUpload(config.API.UPLOAD_IMAGE, tempFilePath, onProgress);
const uploadAudio = (tempFilePath, onProgress) => doUpload(config.API.UPLOAD_AUDIO, tempFilePath, onProgress);

const deleteMedia = async (url) => {
  if (!url) return;
  try {
    await request.delete(config.API.DELETE_MEDIA, { url });
  } catch (error) {
    console.warn('删除媒体失败:', error);
  }
};

const chooseAndUploadImage = async (onProgress) => {
  const files = await chooseImage({ count: 1 });
  const file = files[0];

  if (file.size > 10 * 1024 * 1024) {
    wx.showToast({ title: '图片不能超过10MB', icon: 'none' });
    throw new Error('图片过大');
  }

  return await uploadImage(file.tempFilePath, onProgress);
};

const chooseAndUploadAudio = async (onProgress) => {
  const files = await chooseAudio();
  const file = files[0];

  if (file.size > 50 * 1024 * 1024) {
    wx.showToast({ title: '音频不能超过50MB', icon: 'none' });
    throw new Error('音频过大');
  }

  return await uploadAudio(file.tempFilePath, onProgress);
};

module.exports = {
  formatFileSize,
  chooseImage,
  chooseAudio,
  uploadImage,
  uploadAudio,
  deleteMedia,
  chooseAndUploadImage,
  chooseAndUploadAudio
};
