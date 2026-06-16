const config = require('../config/index');

const request = (options) => {
  return new Promise((resolve, reject) => {
    const authToken = wx.getStorageSync('authToken');

    wx.request({
      url: config.BASE_URL + options.url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        Authorization: authToken ? `Bearer ${authToken}` : '',
        ...(options.header || {})
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data.code === 0) {
          resolve(res.data.data);
          return;
        }

        const rawMessage = res.data?.message || '请求失败';
        const message = rawMessage === 'Validation error' ? '请求参数错误，请稍后重试' : rawMessage;

        const isPremiumRequired = res.statusCode === 403 && res.data?.code === 2;

        if (res.statusCode === 401 && options.authenticated !== false) {
          const app = getApp();
          if (app && typeof app.onLogout === 'function') {
            app.onLogout({ redirect: true });
          } else {
            try {
              wx.reLaunch({ url: '/pages/login/login' });
            } catch (e) {
              try {
                wx.redirectTo({ url: '/pages/login/login' });
              } catch (e2) {
                try {
                  wx.navigateTo({ url: '/pages/login/login' });
                } catch (e3) {
                  console.error('[request] redirect to login failed');
                }
              }
            }
          }
          wx.showToast({ title: authToken ? '登录状态已失效' : '请先登录', icon: 'none' });
        } else if (isPremiumRequired) {
          wx.showModal({
            title: '会员专属功能',
            content: message,
            confirmText: '去开通',
            cancelText: '暂不',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.navigateTo({ url: '/pages/member/member' });
              }
            }
          });
        } else {
          wx.showToast({ title: message, icon: 'none' });
        }
        reject({
          statusCode: res.statusCode,
          message,
          raw: res.data,
          toastShown: true,
          isPremiumRequired
        });
      },
      fail: (err) => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject({
          ...(err || {}),
          message: '网络连接失败',
          toastShown: true
        });
      }
    });
  });
};

const get = (url, data, extra = {}) => request({ ...extra, url, method: 'GET', data });
const post = (url, data, extra = {}) => request({ ...extra, url, method: 'POST', data });
const put = (url, data, extra = {}) => request({ ...extra, url, method: 'PUT', data });
const del = (url, data, extra = {}) => request({ ...extra, url, method: 'DELETE', data });

const uploadFile = (url, filePath, name = 'file', formData = {}, extra = {}) => {
  return new Promise((resolve, reject) => {
    const authToken = wx.getStorageSync('authToken');

    wx.uploadFile({
      url: config.BASE_URL + url,
      filePath,
      name,
      formData,
      header: {
        Authorization: authToken ? `Bearer ${authToken}` : '',
        ...(extra.header || {})
      },
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (res.statusCode >= 200 && res.statusCode < 300 && data.code === 0) {
            resolve(data.data);
            return;
          }

          const message = data?.message || '上传失败';
          wx.showToast({ title: message, icon: 'none' });
          reject({
            statusCode: res.statusCode,
            message,
            raw: data,
            toastShown: true
          });
        } catch (parseError) {
          wx.showToast({ title: '响应解析失败', icon: 'none' });
          reject({
            statusCode: res.statusCode,
            message: '响应解析失败',
            raw: res.data,
            toastShown: true
          });
        }
      },
      fail: (err) => {
        wx.showToast({ title: '网络连接失败', icon: 'none' });
        reject({
          ...(err || {}),
          message: '网络连接失败',
          toastShown: true
        });
      }
    });
  });
};

module.exports = {
  request,
  get,
  post,
  put,
  delete: del,
  uploadFile
};
