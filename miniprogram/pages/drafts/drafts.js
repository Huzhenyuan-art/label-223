const { listDrafts, deleteDraft, getDraftPreview, clearAllDrafts } = require('../../utils/draft');
const { ensureLogin, formatDateLabel, safeNavigateTo, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    drafts: [],
    loading: false,
    isEmpty: false,
    selectedId: '',
    showActions: false,
    actionDraftId: ''
  },

  onShow() {
    ensureLogin();
    this.loadDrafts();
  },

  loadDrafts() {
    this.setData({ loading: true });
    try {
      const rawDrafts = listDrafts();
      const drafts = rawDrafts.map((draft) => {
        const preview = getDraftPreview(draft);
        return {
          ...draft,
          previewTitle: preview.title,
          previewSummary: preview.summary,
          previewTag: preview.tag,
          updatedLabel: formatDateLabel(draft.updatedAt || draft.createdAt, true),
          createdLabel: formatDateLabel(draft.createdAt, true),
          hasCover: !!(draft.coverImage && draft.coverImage.trim()),
          hasAudio: !!(draft.audioUrl && draft.audioUrl.trim()),
          hasLink: !!(draft.linkUrl && draft.linkUrl.trim())
        };
      });

      this.setData({
        drafts,
        isEmpty: drafts.length === 0,
        loading: false
      });
    } catch (error) {
      showFriendlyError(error, '加载草稿失败');
      this.setData({ loading: false });
    }
  },

  goEditDraft(event) {
    if (this.data.showActions) {
      this.setData({ showActions: false, actionDraftId: '' });
      return;
    }
    const draftId = event.currentTarget.dataset.id;
    safeNavigateTo(`/pages/publish/publish?draftId=${draftId}`);
  },

  openActions(event) {
    event.stopPropagation && event.stopPropagation();
    const draftId = event.currentTarget.dataset.id;
    this.setData({
      showActions: true,
      actionDraftId: draftId
    });
  },

  closeActions() {
    this.setData({ showActions: false, actionDraftId: '' });
  },

  editDraft() {
    const draftId = this.data.actionDraftId;
    this.setData({ showActions: false, actionDraftId: '' });
    if (draftId) {
      safeNavigateTo(`/pages/publish/publish?draftId=${draftId}`);
    }
  },

  publishDraft() {
    const draftId = this.data.actionDraftId;
    this.setData({ showActions: false, actionDraftId: '' });
    if (draftId) {
      safeNavigateTo(`/pages/publish/publish?draftId=${draftId}`);
    }
  },

  confirmDeleteDraft() {
    const draftId = this.data.actionDraftId;
    if (!draftId) return;

    wx.showModal({
      title: '删除草稿',
      content: '确定要删除这篇草稿吗？此操作不可撤销。',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.deleteSingleDraft(draftId);
        }
        this.setData({ showActions: false, actionDraftId: '' });
      },
      fail: () => {
        this.setData({ showActions: false, actionDraftId: '' });
      }
    });
  },

  deleteSingleDraft(draftId) {
    try {
      const deleted = deleteDraft(draftId);
      if (deleted) {
        wx.showToast({ title: '已删除', icon: 'success' });
        this.loadDrafts();
      } else {
        wx.showToast({ title: '删除失败', icon: 'none' });
      }
    } catch (error) {
      showFriendlyError(error, '删除失败');
    }
  },

  goCreateNew() {
    safeNavigateTo('/pages/publish/publish');
  },

  confirmClearAll() {
    if (this.data.drafts.length === 0) return;

    wx.showModal({
      title: '清空草稿箱',
      content: `确定要删除全部 ${this.data.drafts.length} 篇草稿吗？此操作不可撤销。`,
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          clearAllDrafts();
          wx.showToast({ title: '草稿箱已清空', icon: 'success' });
          this.loadDrafts();
        }
      }
    });
  },

  preventBubble() {}
});
