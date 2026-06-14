const { get, del } = require('../../utils/request');
const { formatPrice, getImageUrl, getCategoryLabel } = require('../../utils/util');
const config = require('../../config/index');

Page({
  data: {
    items: [],
    loading: true
  },

  onShow() {
    this.loadFavorites();
  },

  async loadFavorites() {
    try {
      this.setData({ loading: true });
      const res = await get(config.API.FAVORITES);
      
      const items = (res.data || []).map(item => ({
        ...item,
        coverImage: getImageUrl(item.images?.[0]),
        priceText: formatPrice(item.price, item.mode),
        categoryLabel: getCategoryLabel(item.category)
      }));

      this.setData({ items, loading: false });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onRemoveFavorite(e) {
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    wx.showModal({
      title: '提示',
      content: '确定取消收藏吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await del(`${config.API.FAVORITES}/${id}`);
            const items = [...this.data.items];
            items.splice(index, 1);
            this.setData({ items });
            wx.showToast({ title: '已取消收藏', icon: 'none' });
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  }
});
