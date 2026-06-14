const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, showFriendlyError } = require('../../utils/util');

const ACCOUNT_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{3,23}$/;
const hasStrongPassword = (value) => /[a-zA-Z]/.test(value) && /\d/.test(value) && value.length >= 8;

Page({
  data: {
    mode: 'login',
    nickname: '',
    account: '',
    password: '',
    confirmPassword: '',
    submitting: false
  },

  onShow() {
    if (ensureLogin({ showToast: false, redirect: false })) {
      wx.switchTab({ url: '/pages/profile/profile' });
    }
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  switchMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!mode || mode === this.data.mode) {
      return;
    }

    this.setData({
      mode,
      password: '',
      confirmPassword: '',
      submitting: false
    });
  },

  validateForm() {
    const mode = this.data.mode;
    const nickname = this.data.nickname.trim();
    const account = this.data.account.trim();
    const password = this.data.password;
    const confirmPassword = this.data.confirmPassword;

    if (mode === 'register' && nickname.length < 2) {
      wx.showToast({ title: '请输入至少 2 个字的昵称', icon: 'none' });
      return null;
    }

    if (!ACCOUNT_PATTERN.test(account)) {
      wx.showToast({ title: '账号需 4-24 位字母、数字或下划线', icon: 'none' });
      return null;
    }

    if (!hasStrongPassword(password)) {
      wx.showToast({ title: '密码至少 8 位且包含字母和数字', icon: 'none' });
      return null;
    }

    if (mode === 'register' && password !== confirmPassword) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return null;
    }

    return {
      mode,
      nickname,
      account,
      password
    };
  },

  async submitAuth() {
    if (this.data.submitting) {
      return;
    }

    const form = this.validateForm();
    if (!form) {
      return;
    }

    this.setData({ submitting: true });

    try {
      const isRegister = form.mode === 'register';
      const session = await request.post(
        isRegister ? config.API.REGISTER : config.API.LOGIN,
        isRegister
          ? {
            nickname: form.nickname,
            account: form.account,
            password: form.password
          }
          : {
            account: form.account,
            password: form.password
          },
        { authenticated: false }
      );

      const app = getApp();
      app.onLoginSuccess(session);
      wx.showToast({ title: isRegister ? '注册成功' : '登录成功', icon: 'success' });
      wx.switchTab({ url: '/pages/index/index' });
    } catch (error) {
      showFriendlyError(
        error,
        form.mode === 'register' ? '注册失败，请检查输入信息' : '登录失败，请检查账号密码'
      );
    } finally {
      this.setData({ submitting: false });
    }
  }
});
