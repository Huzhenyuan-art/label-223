const request = require('../../utils/request');
const config = require('../../config/index');
const { parseTagsInput, ensureLogin, showFriendlyError, safeRedirectTo, safeNavigateTo, formatDateLabel } = require('../../utils/util');
const {
  chooseAndUploadImage,
  chooseAndUploadAudio,
  deleteMedia,
  formatFileSize,
  isImageFile,
  isAudioFile
} = require('../../utils/upload');
const {
  AUTO_SAVE_INTERVAL_MS,
  getDraft,
  saveDraft,
  deleteDraft,
  isDraftEmpty,
  setAutoSaveDraft,
  getAutoSaveDraft,
  clearAutoSaveDraft,
  buildDraft,
  consumePublishPendingParams
} = require('../../utils/draft');

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
    draftId: '',
    isDraftMode: false,
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
    oldAudioUrl: '',
    autoSaveTimer: null,
    lastAutoSavedAt: '',
    autoSaveToastShown: false,
    networkOnline: true,
    recoveredFromAutoSave: false
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

    if (options.draftId) {
      this.setData({
        draftId: options.draftId,
        isDraftMode: true,
        pageTitle: '编辑草稿',
        pageSubtitle: '从草稿恢复编辑，完成后可正式发射频率。',
        submitText: '发射频率'
      });
      this.pendingLoadDraftId = options.draftId;
    }
  },

  async onShow() {
    ensureLogin();
    this.setupNetworkListener();

    const pending = consumePublishPendingParams();
    if (pending && pending.draftId) {
      this.setData({
        draftId: pending.draftId,
        isDraftMode: true,
        pageTitle: '编辑草稿',
        pageSubtitle: '从草稿恢复编辑，完成后可正式发射频率。',
        submitText: '发射频率'
      });
      this.pendingLoadDraftId = pending.draftId;
    } else if (pending && pending.fresh) {
      this.resetPageForFresh();
    }

    if (this.pendingLoadDraftId) {
      const idToLoad = this.pendingLoadDraftId;
      this.pendingLoadDraftId = null;
      await this.loadDraft(idToLoad);
      this.startAutoSave();
      return;
    }

    if (this.data.isEditMode && this.data.editId && !this.data.contentText && !this.data.isDraftMode) {
      await this.loadPostForEdit();
    } else if (!this.data.isDraftMode && !this.data.isEditMode && !this.data.contentText) {
      await this.checkAutoSaveRecovery();
    }

    this.startAutoSave();
  },

  resetPageForFresh() {
    this.setData({
      editId: '',
      isEditMode: false,
      draftId: '',
      isDraftMode: false,
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
      oldCoverImage: '',
      oldAudioUrl: '',
      lastAutoSavedAt: '',
      recoveredFromAutoSave: false
    });
    clearAutoSaveDraft();
  },

  onHide() {
    this.performAutoSave();
    this.stopAutoSave();
  },

  onUnload() {
    this.performAutoSave();
    this.stopAutoSave();
  },

  setupNetworkListener() {
    if (wx.onNetworkStatusChange) {
      wx.onNetworkStatusChange((res) => {
        const wasOffline = !this.data.networkOnline;
        this.setData({ networkOnline: res.isConnected });
        if (wasOffline && res.isConnected) {
          wx.showToast({ title: '网络已恢复', icon: 'success' });
        } else if (!res.isConnected) {
          wx.showToast({ title: '当前处于离线状态，内容已自动保存', icon: 'none' });
        }
      });
    }
  },

  startAutoSave() {
    if (this.data.autoSaveTimer) return;
    const timer = setInterval(() => {
      this.performAutoSave();
    }, AUTO_SAVE_INTERVAL_MS);
    this.setData({ autoSaveTimer: timer });
  },

  stopAutoSave() {
    if (this.data.autoSaveTimer) {
      clearInterval(this.data.autoSaveTimer);
      this.setData({ autoSaveTimer: null });
    }
  },

  performAutoSave() {
    if (this.data.submitting || this.data.uploadingCover || this.data.uploadingAudio) return;
    if (this.data.isEditMode) return;

    const snapshot = this.collectDraftSnapshot();
    if (isDraftEmpty(snapshot)) return;

    snapshot.isAutoSaved = true;
    setAutoSaveDraft(snapshot);

    if (this.data.isDraftMode && this.data.draftId) {
      snapshot._id = this.data.draftId;
      saveDraft(snapshot);
    }

    this.setData({
      lastAutoSavedAt: formatDateLabel(new Date(), true)
    });
  },

  collectDraftSnapshot() {
    return {
      _id: this.data.draftId || undefined,
      title: this.data.title,
      contentText: this.data.contentText,
      dynamicTag: this.data.dynamicTag,
      tagsInput: this.data.tagsInput,
      audioUrl: this.data.audioUrl,
      audioName: this.data.audioName,
      audioSize: this.data.audioSize,
      linkUrl: this.data.linkUrl,
      coverImage: this.data.coverImage,
      coverImageName: this.data.coverImageName,
      coverImageSize: this.data.coverImageSize
    };
  },

  async checkAutoSaveRecovery() {
    const autoSaved = getAutoSaveDraft();
    if (!autoSaved || isDraftEmpty(autoSaved)) {
      clearAutoSaveDraft();
      return;
    }

    return new Promise((resolve) => {
      wx.showModal({
        title: '发现未发布的内容',
        content: '检测到上次编辑的频率内容尚未发布，是否继续编辑？',
        confirmText: '继续编辑',
        cancelText: '放弃',
        success: (res) => {
          if (res.confirm) {
            this.applyDraftToPage(autoSaved);
            this.setData({
              recoveredFromAutoSave: true,
              isDraftMode: true,
              draftId: autoSaved._id || '',
              pageTitle: '继续编辑',
              pageSubtitle: '从自动保存恢复，完成后可正式发射频率。'
            });
            wx.showToast({ title: '已恢复上次编辑内容', icon: 'success' });
          } else {
            clearAutoSaveDraft();
          }
          resolve();
        },
        fail: () => resolve()
      });
    });
  },

  async loadDraft(draftId) {
    this.setData({ loading: true });
    try {
      const draft = getDraft(draftId);
      if (draft) {
        this.applyDraftToPage(draft);
      } else {
        wx.showToast({ title: '草稿不存在或已删除', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (error) {
      showFriendlyError(error, '加载草稿失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  applyDraftToPage(draft) {
    this.setData({
      title: draft.title || '',
      contentText: draft.contentText || '',
      dynamicTag: draft.dynamicTag || '#深夜哲学家',
      tagsInput: draft.tagsInput || '',
      audioUrl: draft.audioUrl || '',
      audioName: draft.audioName || '',
      audioSize: draft.audioSize || '',
      linkUrl: draft.linkUrl || '',
      coverImage: draft.coverImage || '',
      coverImageName: draft.coverImageName || '',
      coverImageSize: draft.coverImageSize || '',
      oldCoverImage: draft.coverImage || '',
      oldAudioUrl: draft.audioUrl || ''
    });
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

  goDraftList() {
    this.stopAutoSave();
    safeNavigateTo('/pages/drafts/drafts');
  },

  saveCurrentToDrafts() {
    const snapshot = this.collectDraftSnapshot();
    if (isDraftEmpty(snapshot)) {
      wx.showToast({ title: '内容为空，无法保存草稿', icon: 'none' });
      return;
    }
    if (this.data.draftId) {
      snapshot._id = this.data.draftId;
    }
    const result = saveDraft(snapshot);
    if (result.saved) {
      if (!this.data.draftId) {
        this.setData({ draftId: result.draft._id, isDraftMode: true });
      }
      clearAutoSaveDraft();
      wx.showToast({ title: '已保存到草稿箱', icon: 'success' });
    }
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
    this.stopAutoSave();

    try {
      let post;
      if (this.data.isEditMode && this.data.editId) {
        post = await request.put(`${config.API.UPDATE_POST}/${this.data.editId}`, postData);
        wx.showToast({ title: '修改已保存', icon: 'success' });
      } else {
        post = await request.post(config.API.CREATE_POST, postData);
        wx.showToast({ title: '频率发射成功', icon: 'success' });

        if (this.data.draftId) {
          deleteDraft(this.data.draftId);
        }
        clearAutoSaveDraft();

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
          oldAudioUrl: '',
          draftId: '',
          isDraftMode: false,
          recoveredFromAutoSave: false
        });
      }

      safeRedirectTo(`/pages/detail/detail?id=${post._id}`);
    } catch (error) {
      const authExpired = error?.statusCode === 401;
      const networkError = !error || error.errMsg === 'request:fail' || (error.statusCode && error.statusCode >= 500);

      if (networkError && !authExpired) {
        const snapshot = this.collectDraftSnapshot();
        if (!isDraftEmpty(snapshot)) {
          if (this.data.draftId) {
            snapshot._id = this.data.draftId;
          }
          const saveResult = saveDraft(snapshot);
          if (saveResult.saved && !this.data.draftId) {
            this.setData({ draftId: saveResult.draft._id, isDraftMode: true });
          }
        }
        this.startAutoSave();
        wx.showModal({
          title: '网络异常，已保存为草稿',
          content: '当前网络不可用，内容已保存到草稿箱，稍后可从草稿箱恢复发布。',
          showCancel: false,
          confirmText: '查看草稿箱',
          success: (res) => {
            if (res.confirm) {
              safeNavigateTo('/pages/drafts/drafts');
            }
          }
        });
      } else {
        const fallbackMsg = this.data.isEditMode ? '保存失败，请稍后重试' : '发射失败，请稍后重试';
        showFriendlyError(error, fallbackMsg);
        this.startAutoSave();
      }
    } finally {
      this.setData({ submitting: false });
    }
  }
});
