const request = require('../../utils/request');
const config = require('../../config/index');
const { safeNavigateTo } = require('../../utils/util');

Page({
  data: {
    keyword: '',
    activeTag: '',
    allTags: [],
    items: [],
    loading: true,
    editMode: false,
    selectedIds: []
  },

  onShow() {
    this.loadFavorites();
  },

  async loadFavorites() {
    try {
      this.setData({ loading: true });
      const params = {};
      if (this.data.keyword) params.keyword = this.data.keyword;
      if (this.data.activeTag) params.tag = this.data.activeTag;

      const res = await request.get(config.API.FAVORITES_SEARCH, params);

      const items = (res.posts || []).map(item => ({
        ...item,
        coverImage: item.coverImage || (item.images && item.images[0]) || '',
        authorNickname: item.author?.nickname || ''
      }));

      this.setData({
        items,
        allTags: res.allTags || [],
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  handleKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  handleSearch() {
    this.loadFavorites();
  },

  handleTagFilter(e) {
    const tag = e.currentTarget.dataset.tag;
    this.setData({
      activeTag: this.data.activeTag === tag ? '' : tag,
      editMode: false,
      selectedIds: []
    });
    this.loadFavorites();
  },

  handleClearFilter() {
    this.setData({ keyword: '', activeTag: '', editMode: false, selectedIds: [] });
    this.loadFavorites();
  },

  toggleEditMode() {
    this.setData({
      editMode: !this.data.editMode,
      selectedIds: []
    });
  },

  toggleSelectItem(e) {
    const id = e.currentTarget.dataset.id;
    const selectedIds = [...this.data.selectedIds];
    const idx = selectedIds.indexOf(id);
    if (idx > -1) {
      selectedIds.splice(idx, 1);
    } else {
      selectedIds.push(id);
    }
    this.setData({ selectedIds });
  },

  toggleSelectAll() {
    if (this.data.selectedIds.length === this.data.items.length) {
      this.setData({ selectedIds: [] });
    } else {
      this.setData({ selectedIds: this.data.items.map(item => item._id) });
    }
  },

  async handleBatchRemove() {
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请先选择要取消收藏的内容', icon: 'none' });
      return;
    }

    const count = this.data.selectedIds.length;
    wx.showModal({
      title: '批量取消收藏',
      content: `确定要取消收藏选中的 ${count} 项内容吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.post(config.API.FAVORITES_BATCH_REMOVE, {
              postIds: this.data.selectedIds
            });
            wx.showToast({ title: `已取消收藏 ${count} 项`, icon: 'none' });
            this.setData({ editMode: false, selectedIds: [] });
            this.loadFavorites();
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onRemoveFavorite(e) {
    const id = e.currentTarget.dataset.id;

    wx.showModal({
      title: '提示',
      content: '确定取消收藏吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.post(`${config.API.TOGGLE_FAVORITE_PREFIX}/${id}/toggle`);
            wx.showToast({ title: '已取消收藏', icon: 'none' });
            this.loadFavorites();
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  goToDetail(e) {
    if (this.data.editMode) return;
    const id = e.currentTarget.dataset.id;
    safeNavigateTo(`/pages/detail/detail?id=${id}`);
  }
});
