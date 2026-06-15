const request = require('../../utils/request');
const config = require('../../config/index');
const { parseTagsInput, ensureLogin, showFriendlyError } = require('../../utils/util');
const {
  chooseAndUploadImage,
  chooseAndUploadAudio,
  deleteMedia,
  formatFileSize,
  isImageFile,
  isAudioFile
} = require('../../utils/upload');

const isValidMediaUrl = (url, type) => {
  if (!url) return true;
  try {
    const urlObj = new URL(url);
    const fileName = urlObj.pathname.split('/').pop();
    if (type === 'image') return isImageFile(fileName);
    if (type === 'audio') return isAudioFile(fileName);
    return false;
  } catch (e) {
    return false;
  }
};

Page({
  data: {
    editId: '',
    isEditMode: false,
    pageTitle: '频率发射站',
    pageSubtitle: '每条内容都可以使用新的动态标签，自由表达不被固定身份束缚。',
    submitText: '发射频率',
    title: '',
    contentText: '',
    dynamicTag: '#深夜哲学家',
    tagsInput: '成长,情绪',
    audioUrl: '',
    audioName: '',
    audioSize: '',
    linkUrl: '',
    coverImage: '',
    coverImageName: '',
    coverImageSize: '',
    presets: ['#深夜哲学家', '#冷门乐器控', '#慢热社交派', '#纸页漫游者', '#声景采样师'],
    submitting: false,
    loading: false,
    uploadingCover: false,
    coverUploadProgress: 0,
    uploadingAudio: false,
    audioUploadProgress: 0,
    oldCoverImage: '',
    oldAudioUrl: ''
  },

  onLoad(options) {
    if (options.editId) {
      this.setData({
        editId: options.editId,
        isEditMode: true,
        pageTitle: '编辑频率',
        pageSubtitle: '修改你的频率内容，原有的共鸣、回声与合鸣将保留。',
        submitText: '保存修改'
      });
    }
  },

  async onShow() {
    ensureLogin();
    if (this.data.isEditMode && this.data.editId && !this.data.contentText) {
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
        coverImage: post.coverImage || '',
        oldCoverImage: post.coverImage || '',
        oldAudioUrl: post.contentAudio || ''
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

  async onChooseCover() {
    if (this.data.uploadingCover) return;

    try {
      this.setData({ uploadingCover: true, coverUploadProgress: 0 });

      const result = await chooseAndUploadImage((status) => {
        if (!status.done) {
          this.setData({ coverUploadProgress: status.progress });
        }
      });

      if (this.data.coverImage && this.data.coverImage !== this.data.oldCoverImage) {
        await deleteMedia(this.data.coverImage);
      }

      this.setData({
        coverImage: result.url,
        coverImageName: result.fileName,
        coverImageSize: formatFileSize(result.size),
        uploadingCover: false,
        coverUploadProgress: 0
      });

      wx.showToast({ title: '封面上传成功', icon: 'success' });
    } catch (error) {
      this.setData({ uploadingCover: false, coverUploadProgress: 0 });
      if (error.message !== '已取消选择') {
        showFriendlyError(error, '封面上传失败');
      }
    }
  },

  async onRemoveCover() {
    if (this.data.uploadingCover) return;

    const currentCover = this.data.coverImage;

    wx.showModal({
      title: '移除封面',
      content: '确定要移除当前封面图吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({
            coverImage: '',
            coverImageName: '',
            coverImageSize: ''
          });

          if (currentCover && currentCover !== this.data.oldCoverImage) {
            await deleteMedia(currentCover);
          }
        }
      }
    });
  },

  async onChooseAudio() {
    if (this.data.uploadingAudio) return;

    try {
      this.setData({ uploadingAudio: true, audioUploadProgress: 0 });

      const result = await chooseAndUploadAudio((status) => {
        if (!status.done) {
          this.setData({ audioUploadProgress: status.progress });
        }
      });

      if (this.data.audioUrl && this.data.audioUrl !== this.data.oldAudioUrl) {
        await deleteMedia(this.data.audioUrl);
      }

      this.setData({
        audioUrl: result.url,
        audioName: result.fileName,
        audioSize: formatFileSize(result.size),
        uploadingAudio: false,
        audioUploadProgress: 0
      });

      wx.showToast({ title: '音频上传成功', icon: 'success' });
    } catch (error) {
      this.setData({ uploadingAudio: false, audioUploadProgress: 0 });
      if (error.message !== '已取消选择') {
        showFriendlyError(error, '音频上传失败');
      }
    }
  },

  async onRemoveAudio() {
    if (this.data.uploadingAudio) return;

    const currentAudio = this.data.audioUrl;

    wx.showModal({
      title: '移除音频',
      content: '确定要移除当前音频吗？',
      success: async (res) => {
        if (res.confirm) {
          this.setData({
            audioUrl: '',
            audioName: '',
            audioSize: ''
          });

          if (currentAudio && currentAudio !== this.data.oldAudioUrl) {
            await deleteMedia(currentAudio);
          }
        }
      }
    });
  },

  async submitPost() {
    if (!ensureLogin()) {
      return;
    }

    if (this.data.submitting) {
      return;
    }

    if (this.data.uploadingCover || this.data.uploadingAudio) {
      wx.showToast({ title: '请等待媒体上传完成', icon: 'none' });
      return;
    }

    const coverImage = this.data.coverImage.trim();
    const audioUrl = this.data.audioUrl.trim();

    if (coverImage && !isValidMediaUrl(coverImage, 'image')) {
      wx.showToast({ title: '封面图片非法，请重新上传', icon: 'none' });
      return;
    }

    if (audioUrl && !isValidMediaUrl(audioUrl, 'audio')) {
      wx.showToast({ title: '音频文件非法，请重新上传', icon: 'none' });
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
      audioUrl,
      linkUrl: this.data.linkUrl.trim(),
      coverImage
    };

    this.setData({ submitting: true });

    try {
      let post;
      if (this.data.isEditMode && this.data.editId) {
        post = await request.put(`${config.API.UPDATE_POST}/${this.data.editId}`, postData);
        wx.showToast({ title: '修改已保存', icon: 'success' });
      } else {
        post = await request.post(config.API.CREATE_POST, postData);
        wx.showToast({ title: '频率发射成功', icon: 'success' });

        this.setData({
          title: '',
          contentText: '',
          tagsInput: '',
          audioUrl: '',
          audioName: '',
          audioSize: '',
          linkUrl: '',
          coverImage: '',
          coverImageName: '',
          coverImageSize: '',
          oldCoverImage: '',
          oldAudioUrl: ''
        });
      }

      wx.redirectTo({ url: `/pages/detail/detail?id=${post._id}` });
    } catch (error) {
      const fallbackMsg = this.data.isEditMode ? '保存失败，请稍后重试' : '发射失败，请稍后重试';
      showFriendlyError(error, fallbackMsg);
    } finally {
      this.setData({ submitting: false });
    }
  }
});
