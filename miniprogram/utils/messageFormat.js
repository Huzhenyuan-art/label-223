const { formatTimeAgo, normalizeDynamicTag, formatCountdown } = require('./util');

const _getCurrentUserId = () => {
  try {
    return wx.getStorageSync('userId');
  } catch (e) {
    return '';
  }
};

const formatMessageItem = (item, userId) => {
  const uid = userId || _getCurrentUserId();
  const senderId = item.sender?._id || item.sender;
  return {
    ...item,
    timeAgo: formatTimeAgo(item.createdAt),
    mine: String(senderId) === String(uid),
    sourcePostLabel: item.sourcePost
      ? item.sourcePost.title || item.sourcePost.dynamicTag || ''
      : ''
  };
};

const formatMessageList = (list, userId) => {
  return (list || []).map((item) => formatMessageItem(item, userId));
};

const formatConversationItem = (item) => {
  const revealed = item.reveal?.revealed;
  const lastCreatedAt = item.lastMessage?.createdAt;
  return {
    ...item,
    timeAgo: formatTimeAgo(lastCreatedAt),
    displayName: item.user?.nickname || '同频回声',
    revealText: revealed
      ? '身份已揭示'
      : item.reveal?.eligible
        ? '可申请揭示身份'
        : '交换3条消息后可揭示'
  };
};

const formatConversationList = (list) => {
  return (list || []).map((item) => formatConversationItem(item));
};

const createAutoRevealCountdownTimer = (onTick, onExpired) => {
  let timer = null;

  const start = (deadlineDate) => {
    stop();
    if (!deadlineDate) return;
    const deadline = new Date(deadlineDate).getTime();

    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        stop();
        onExpired?.();
        return;
      }
      onTick?.(formatCountdown(remaining));
    };

    tick();
    timer = setInterval(tick, 1000);
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { start, stop };
};

module.exports = {
  formatMessageItem,
  formatMessageList,
  formatConversationItem,
  formatConversationList,
  createAutoRevealCountdownTimer
};
