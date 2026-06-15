const request = require('../../utils/request');
const config = require('../../config/index');
const socket = require('../../utils/socket');
const { ensureLogin, formatTimeAgo, showFriendlyError } = require('../../utils/util');

Page({
  data: {
    conversations: [],
    unreadCount: 0,
    loading: false
  },

  _socketHandlers: {},

  onShow() {
    if (!ensureLogin()) {
      return;
    }
    this.loadAll();
    this._bindSocketEvents();
  },

  onHide() {
    this._unbindSocketEvents();
  },

  onUnload() {
    this._unbindSocketEvents();
  },

  _bindSocketEvents() {
    const onMessage = (msg) => {
      if (!msg) return;

      this.setData({
        unreadCount: this.data.unreadCount + 1
      });

      this.loadAll();
    };

    const onReadAck = () => {
      this.loadAll();
    };

    const onReveal = () => {
      this.loadAll();
    };

    this._socketHandlers = { onMessage, onReadAck, onReveal };

    socket.on('message', onMessage);
    socket.on('readAck', onReadAck);
    socket.on('reveal', onReveal);
  },

  _unbindSocketEvents() {
    const { onMessage, onReadAck, onReveal } = this._socketHandlers;
    socket.off('message', onMessage);
    socket.off('readAck', onReadAck);
    socket.off('reveal', onReveal);
    this._socketHandlers = {};
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const [conversations, unread] = await Promise.all([
        request.get(config.API.CONVERSATIONS),
        request.get(config.API.UNREAD_COUNT)
      ]);

      const list = (conversations || []).map((item) => {
        const revealed = item.reveal?.revealed;
        return {
          ...item,
          timeAgo: formatTimeAgo(item.lastMessage?.createdAt),
          displayName: revealed ? (item.user?.nickname || '同频回声') : '同频回声',
          revealText: revealed
            ? '身份已揭示'
            : item.reveal?.eligible
              ? '可申请揭示身份'
              : '交换3条消息后可揭示'
        };
      });

      this.setData({
        conversations: list,
        unreadCount: unread?.count || 0
      });
    } catch (error) {
      showFriendlyError(error, '消息列表加载失败，请稍后重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  openChat(event) {
    const { conversationId, userId, name, reveal } = event.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/chat/chat?conversationId=${conversationId}&otherUserId=${userId}&name=${encodeURIComponent(name)}&revealed=${reveal ? '1' : '0'}`
    });
  }
});
