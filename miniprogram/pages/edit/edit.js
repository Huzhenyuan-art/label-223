const request = require('../../utils/request');
const config = require('../../config/index');
const { parseTagsInput, ensureLogin, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    editId: '',
    pageTitle: '编辑频率',
    pageSubtitle: '修改你的频率内容，原有的共鸣、回声与合鸣将保留。',
    submitText: '保存修改',
    title: '',
    contentText: '',
    dynamicTag: '#深夜哲学家',
    tagsInput: '成长,情绪',
    audioUrl: '',
    linkUrl: '',
    coverImage: '',
    presets: ['#深夜哲学家', '#冷门乐器控', '#慢热社交派', '#纸页漫游者', '#声景采样师'],
    submitting: false,
    loading: false
  },

  onLoad(options) {
    if (options.editId) {
      this.setData({ editId: options.editId });
    }
  },

  async onShow() {
    ensureLogin();
    if (this.data.editId && !this.data.contentText) {
      await this.loadPostForEdit();
    }
  },

  async loadPostForEdit() {
    const editId = this.data.editId;
    if (!editId) {
      return;
    }

    this.setData({ loading: true });
    try {
      const detail = await request.get(`${config.API.POST_DETAIL_PREFIX}/${editId}`);
      const post = detail.post;

      if (String(post?.author?._id) !== String(wx.getStorageSync('userId'))) {
        wx.showToast({ title: '无权限编辑此内容', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      if (post?.type !== 'origin') {
        wx.showToast({ title: '仅原频可编辑', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      this.setData({
        title: post.title || '',
        contentText: post.contentText || '',
        dynamicTag: post.dynamicTag || '#深夜哲学家',
        tagsInput: (post.tags || []).join(', '),
        audioUrl: post.contentAudio || '',
        linkUrl: post.contentLink || '',
        coverImage: post.coverImage || ''
      });
    } catch (error) {
      showFriendlyError(error, '加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
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

    const postData = {
      title: this.data.title.trim(),
      contentText,
      dynamicTag,
      tags,
      audioUrl: this.data.audioUrl.trim(),
      linkUrl: this.data.linkUrl.trim(),
      coverImage: this.data.coverImage.trim()
    };

    this.setData({ submitting: true });

    try {
      const post = await request.put(`${config.API.UPDATE_POST}/${this.data.editId}`, postData);
      wx.showToast({ title: '修改已保存', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/detail/detail?id=${post._id}` });
      }, 1500);
    } catch (error) {
      showFriendlyError(error, '保存失败，请稍后重试');
    } finally {
      this.setData({ submitting: false });
    }
  }
});
