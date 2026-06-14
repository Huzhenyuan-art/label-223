const { get, put } = require('../../utils/request');
const { formatTime, formatPrice, getImageUrl, getModeLabel } = require('../../utils/util');
const config = require('../../config/index');

Page({
  data: {
    transactions: [],
    loading: true
  },

  onShow() {
    this.loadTransactions();
  },

  async loadTransactions() {
    try {
      this.setData({ loading: true });
      const res = await get(config.API.MY_TRANSACTIONS);
      
      const userId = wx.getStorageSync('userId');
      const transactions = res.data.map(t => ({
        ...t,
        itemImage: getImageUrl(t.item?.images?.[0]),
        itemTitle: t.item?.title || '物品已删除',
        priceText: formatPrice(t.price, t.mode),
        modeLabel: getModeLabel(t.mode),
        timeText: formatTime(t.createdAt),
        isSeller: t.seller?._id === userId,
        statusText: t.status === 'pending' ? '进行中' :
                    t.status === 'completed' ? '已完成' : '已取消',
        otherUser: t.seller?._id === userId ? t.buyer : t.seller
      }));

      this.setData({ transactions, loading: false });
    } catch (error) {
      this.setData({ loading: false });
    }
  },

  onComplete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定完成此交易吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await put(`${config.API.TRANSACTIONS}/${id}/complete`);
            wx.showToast({ title: '交易已完成', icon: 'success' });
            this.loadTransactions();
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  onCancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认',
      content: '确定取消此交易吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await put(`${config.API.TRANSACTIONS}/${id}/cancel`);
            wx.showToast({ title: '已取消', icon: 'success' });
            this.loadTransactions();
          } catch (error) {
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  }
});
