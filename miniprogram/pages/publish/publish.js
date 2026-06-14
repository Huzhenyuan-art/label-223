const request = require('../../utils/request');
const config = require('../../config/index');
const { parseTagsInput, ensureLogin, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    title: '',
    contentText: '',
    dynamicTag: '#深夜哲学家',
    tagsInput: '成长,情绪',
    audioUrl: '',
    linkUrl: '',
    coverImage: '',
    presets: ['#深夜哲学家', '#冷门乐器控', '#慢热社交派', '#纸页漫游者', '#声景采样师'],
    submitting: false
  },

  onShow() {
    ensureLogin();
  },

  usePresetTag(event) {
    this.setData({ dynamicTag: event.currentTarget.dataset.tag });
  },

  bindField(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value });
  },

  async submitPost() {
    if (!ensureLogin()) {
      return;
    }

    if (this.data.submitting) {
      return;
    }

    const contentText = this.data.contentText.trim();
    if (contentText.length < 2) {
      wx.showToast({ title: '请输入至少2个字内容', icon: 'none' });
      return;
    }

    const tags = parseTagsInput(this.data.tagsInput);
    if (!tags.length) {
      wx.showToast({ title: '请至少输入一个标签', icon: 'none' });
      return;
    }

    const dynamicTag = this.data.dynamicTag.startsWith('#') || this.data.dynamicTag.startsWith('＃')
      ? this.data.dynamicTag
      : `#${this.data.dynamicTag}`;

    this.setData({ submitting: true });

    try {
      const post = await request.post(config.API.CREATE_POST, {
        title: this.data.title.trim(),
        contentText,
        dynamicTag,
        tags,
        audioUrl: this.data.audioUrl.trim(),
        linkUrl: this.data.linkUrl.trim(),
        coverImage: this.data.coverImage.trim()
      });

      wx.showToast({ title: '频率发射成功', icon: 'success' });

      this.setData({
        title: '',
        contentText: '',
        tagsInput: '',
        audioUrl: '',
        linkUrl: '',
        coverImage: ''
      });

      wx.navigateTo({ url: `/pages/detail/detail?id=${post._id}` });
    } catch (error) {
      showFriendlyError(error, '发射失败，请稍后重试');
    } finally {
      this.setData({ submitting: false });
    }
  }
});
