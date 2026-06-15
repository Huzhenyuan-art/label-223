const request = require('../../utils/request');
const config = require('../../config/index');
const { ensureLogin, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    name: '',
    theme: '',
    description: '',
    submitting: false
  },

  onLoad() {
    if (!ensureLogin()) return;
  },

  bindField(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  async submit() {
    const { name, theme, description } = this.data;

    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入小组名称', icon: 'none' });
      return;
    }
    if (name.trim().length < 2) {
      wx.showToast({ title: '小组名称至少2个字符', icon: 'none' });
      return;
    }
    if (!theme || !theme.trim()) {
      wx.showToast({ title: '请输入小组主题', icon: 'none' });
      return;
    }
    if (theme.trim().length < 2) {
      wx.showToast({ title: '小组主题至少2个字符', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const group = await request.post(config.API.PRIVATE_GROUPS_CREATE, {
        name: name.trim(),
        theme: theme.trim(),
        description: (description || '').trim()
      });
      wx.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/groupDetail/groupDetail?id=${group.id}` });
      }, 800);
    } catch (error) {
      this.setData({ submitting: false });
      showFriendlyError(error, '创建失败');
    }
  }
});
