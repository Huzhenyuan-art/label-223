const request = require('../../utils/request');
const config = require('../../config/index');
const { createSocketManager } = require('../../utils/socketManager');
const { formatConversationList } = require('../../utils/messageFormat');
const { ensureLogin, showFriendlyError, safeNavigateTo } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    conversations: [],
    unreadCount: 0,
    loading: false
  },

  _socketManager: null,

  onShow() {
    if (!ensureLogin()) {
      return;
    }

    this._socketManager = this._socketManager || createSocketManager(this);
    this._socketManager.bind({
      message: this._handleMessageRefresh.bind(this),
      readAck: this._handleMessageRefresh.bind(this),
      reveal: this._handleMessageRefresh.bind(this),
      tempNickname: this._handleMessageRefresh.bind(this),
      unread: this._handleUnread.bind(this)
    });

    this.loadAll();
    this._syncUnreadFromApp();
  },

  onHide() {
    this._socketManager?.unbind();
  },

  onUnload() {
    this._socketManager?.unbind();
  },

  _syncUnreadFromApp() {
    if (!app) return;
    const { unreadCount, unreadConversations } = app.globalData;
    this.setData({ unreadCount });
    this._applyConversationUnreads(unreadConversations);
  },

  _applyConversationUnreads(conversations) {
    if (!conversations || !Object.keys(conversations).length) return;
    const list = this.data.conversations.map((item) => {
      const count = conversations[item.conversationId] || 0;
      return { ...item, unreadCount: count };
    });
    this.setData({ conversations: list });
  },

  _handleMessageRefresh() {
    this.loadAll();
  },

  _handleUnread(data) {
    if (!data) return;
    this.setData({ unreadCount: data.total || 0 });
    this._applyConversationUnreads(data.conversations || {});
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [conversations, unread] = await Promise.all([
        request.get(config.API.CONVERSATIONS),
        request.get(config.API.UNREAD_COUNT)
      ]);

      const list = formatConversationList(conversations || []);

      this.setData({
        conversations: list,
        unreadCount: unread?.count || 0
      });

      if (app) {
        app.globalData.unreadCount = unread?.count || 0;
      }
    } catch (error) {
      showFriendlyError(error, '消息列表加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  openChat(event) {
    const { conversationId, userId, name, reveal } = event.currentTarget.dataset;
    safeNavigateTo(
      `/pages/chat/chat?conversationId=${conversationId}&otherUserId=${userId}&name=${encodeURIComponent(name)}&revealed=${reveal ? '1' : '0'}`
    );
  }
});
