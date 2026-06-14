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
        if (res.statusCode === 401 && options.authenticated !== false) {
          const app = getApp();
          if (app && typeof app.onLogout === 'function') {
            app.onLogout();
          }
          wx.showToast({ title: authToken ? '登录状态已失效' : '请先登录', icon: 'none' });
        } else {
          wx.showToast({ title: message, icon: 'none' });
        }
        reject({
          statusCode: res.statusCode,
          message,
          raw: res.data,
          toastShown: true
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

module.exports = {
  request,
  get,
  post
};
