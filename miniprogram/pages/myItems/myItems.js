const { get, del } = require('../../utils/request');
const { formatTime, formatPrice, getImageUrl, getCategoryLabel } = require('../../utils/util');
const config = require('../../config/index');

Page({
  data: {
    items: [],
    loading: true
  },

  onShow() {
    this.loadMyItems();
  },

  async loadMyItems() {
    try {
      this.setData({ loading: true });
      const res = await get(config.API.MY_ITEMS);
      
      const items = res.data.map(item => ({
        ...item,
        coverImage: getImageUrl(item.images[0]),
        priceText: formatPrice(item.price, item.mode),
        categoryLabel: getCategoryLabel(item.category),
        timeText: formatTime(item.createdAt),
        statusText: item.status === 'available' ? '在售' : 
                     item.status === 'reserved' ? '已预约' : '已完成'
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

  onEdit(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.items[index];

    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' });
      return;
    }

    wx.setStorageSync('editingItemDraft', {
      _id: item._id,
      title: item.title,
      category: item.category,
      mode: item.mode,
      price: item.price,
      description: item.description || '',
      images: item.images || [],
      campus: item.campus,
      location: item.location || {}
    });

    wx.switchTab({ url: '/pages/publish/publish' });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const index = e.currentTarget.dataset.index;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个物品吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await del(`${config.API.ITEMS}/${id}`);
            const items = [...this.data.items];
            items.splice(index, 1);
            this.setData({ items });
            wx.showToast({ title: '已删除', icon: 'success' });
          } catch (error) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  }
});
