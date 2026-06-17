const request = require('../../utils/request');
const config = require('../../config/index');
const socket = require('../../utils/socket');
const { ensureLogin, formatTimeAgo, showFriendlyError, safeNavigateTo } = require('../../utils/util');
const app = getApp();

const NOTIFICATION_TABS = [
  { key: 'all', label: '全部' },
  { key: 'resonance', label: '共鸣' },
  { key: 'comment', label: '回声' },
  { key: 'super_echo', label: '合鸣' },
  { key: 'reveal', label: '身份揭示' }
];

Page({
  data: {
    tabs: NOTIFICATION_TABS,
    activeTab: 'all',
    notifications: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    unreadCounts: {
      resonance: 0,
      comment: 0,
      super_echo: 0,
      reveal_request: 0,
      reveal_success: 0,
      total: 0
    }
  },

  _socketHandlers: {},

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this._bindSocketEvents();
    this._syncUnreadFromApp();
    this.loadNotifications(true);
  },

  onHide() {
    this._unbindSocketEvents();
  },

  onUnload() {
    this._unbindSocketEvents();
  },

  _syncUnreadFromApp() {
    if (!app) return;
    const { unreadNotificationsByType } = app.globalData;
    if (unreadNotificationsByType) {
      this.setData({ unreadCounts: unreadNotificationsByType });
    }
  },

  _bindSocketEvents() {
    const onNotificationUnread = (data) => {
      if (data) {
        this.setData({ unreadCounts: data });
      }
    };

    this._socketHandlers = { onNotificationUnread };
    socket.on('notification_unread', onNotificationUnread);
  },

  _unbindSocketEvents() {
    const { onNotificationUnread } = this._socketHandlers;
    socket.off('notification_unread', onNotificationUnread);
    this._socketHandlers = {};
  },

  switchTab(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeTab) return;
    this.setData({ activeTab: key, page: 1, hasMore: true, notifications: [] });
    this.loadNotifications(true);
  },

  getRequestType() {
    const { activeTab } = this.data;
    if (activeTab === 'all') return null;
    if (activeTab === 'reveal') return null;
    return activeTab;
  },

  async loadNotifications(refresh = false) {
    if (this.data.loading || (!refresh && !this.data.hasMore)) return;

    this.setData({ loading: true });

    try {
      const page = refresh ? 1 : this.data.page;
      const type = this.getRequestType();

      const params = { page, limit: this.data.pageSize };
      if (type) {
        params.type = type;
      }

      const result = await request.get(config.API.NOTIFICATIONS, params);

      let list = result?.list || [];

      if (this.data.activeTab === 'reveal') {
        list = list.filter(item =>
          item.type === 'reveal_request' || item.type === 'reveal_success'
        );
      }

      const formattedList = list.map(item => this.formatNotification(item));

      this.setData({
        notifications: refresh ? formattedList : [...this.data.notifications, ...formattedList],
        page: page + 1,
        hasMore: result?.pagination ? page < result.pagination.pages : false
      });
    } catch (error) {
      showFriendlyError(error, '通知列表加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  formatNotification(item) {
    const type = item.type;
    let title = '';
    let desc = '';
    let iconType = '';

    switch (type) {
      case 'resonance':
        title = '有人共鸣了你的帖子';
        desc = item.post?.title || item.post?.contentText?.slice(0, 50) || '帖子';
        iconType = 'resonance';
        break;
      case 'comment':
        title = `${item.senderDynamicTag || '某人'} 评论了你的帖子`;
        desc = item.content || item.comment?.content || '';
        iconType = 'comment';
        break;
      case 'super_echo':
        title = `${item.senderDynamicTag || '某人'} 合鸣了你的帖子`;
        desc = item.superEcho?.title || item.post?.title || '';
        iconType = 'super_echo';
        break;
      case 'reveal_request':
        title = '有人申请揭示身份';
        desc = '对方申请揭示身份，去看看吧';
        iconType = 'reveal';
        break;
      case 'reveal_success':
        title = '身份揭示成功';
        desc = '双方已同意揭示身份，可以看到真实昵称了';
        iconType = 'reveal';
        break;
      default:
        title = '新通知';
        desc = '';
        iconType = 'default';
    }

    return {
      ...item,
      title,
      desc,
      iconType,
      timeAgo: formatTimeAgo(item.createdAt)
    };
  },

  async markAllAsRead() {
    try {
      await request.post(config.API.NOTIFICATIONS_READ_ALL, {});
      const { notifications } = this.data;
      const updated = notifications.map(item => ({ ...item, read: true }));
      this.setData({ notifications: updated });

      if (app) {
        app.refreshNotificationCount();
      }
    } catch (error) {
      showFriendlyError(error, '标记已读失败，请稍后重试');
    }
  },

  async onNotificationTap(e) {
    const { item } = e.currentTarget.dataset;
    if (!item) return;

    if (!item.read) {
      try {
        await request.post(config.API.NOTIFICATIONS_READ, {
          notificationIds: [item._id]
        });

        const notifications = this.data.notifications.map(n =>
          n._id === item._id ? { ...n, read: true } : n
        );
        this.setData({ notifications });

        if (app) {
          app.refreshNotificationCount();
        }
      } catch (e) {
        // ignore
      }
    }

    this.navigateToTarget(item);
  },

  navigateToTarget(item) {
    const type = item.type;

    switch (type) {
      case 'resonance':
      case 'comment':
      case 'super_echo':
        if (item.post) {
          const postId = item.post._id || item.post;
          safeNavigateTo(`/pages/detail/detail?id=${postId}`);
        }
        break;
      case 'reveal_request':
      case 'reveal_success':
        if (item.conversationId) {
          safeNavigateTo(`/pages/chat/chat?conversationId=${item.conversationId}`);
        }
        break;
      default:
        break;
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadNotifications(false);
    }
  },

  onPullDownRefresh() {
    this.loadNotifications(true).then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
