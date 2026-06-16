const config = require('../config/index');

const STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting'
};

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const HEARTBEAT_INTERVAL = 25000;
const HEARTBEAT_TIMEOUT = 10000;

let socketTask = null;
let state = STATE.DISCONNECTED;
let authToken = null;
let authed = false;

let reconnectTimer = null;
let reconnectAttempts = 0;
let heartbeatTimer = null;
let heartbeatTimeoutTimer = null;

let pendingQueue = [];

const listeners = {};

const on = (event, handler) => {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(handler);
};

const off = (event, handler) => {
  if (!listeners[event]) {
    return;
  }
  if (!handler) {
    listeners[event] = [];
    return;
  }
  listeners[event] = listeners[event].filter((fn) => fn !== handler);
};

const emit = (event, data) => {
  const handlers = listeners[event];
  if (!handlers || handlers.length === 0) {
    return;
  }
  handlers.forEach((fn) => {
    try {
      fn(data);
    } catch (e) {
      console.error(`[socket] event handler error for "${event}":`, e);
    }
  });
};

const getState = () => state;
const isConnected = () => state === STATE.CONNECTED && authed;

const clearTimers = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatTimeoutTimer) {
    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = null;
  }
};

const startHeartbeat = () => {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (!socketTask || state !== STATE.CONNECTED) {
      return;
    }
    sendRaw({ type: 'ping' });

    clearTimeout(heartbeatTimeoutTimer);
    heartbeatTimeoutTimer = setTimeout(() => {
      console.warn('[socket] heartbeat timeout, closing connection');
      if (socketTask) {
        socketTask.close();
      }
    }, HEARTBEAT_TIMEOUT);
  }, HEARTBEAT_INTERVAL);
};

const flushQueue = () => {
  while (pendingQueue.length > 0) {
    const item = pendingQueue.shift();
    sendRaw(item);
  }
};

const scheduleReconnect = () => {
  if (state === STATE.DISCONNECTED) {
    return;
  }

  state = STATE.RECONNECTING;
  emit('stateChange', state);

  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_DELAY
  );
  const jitter = delay * (0.5 + Math.random() * 0.5);

  console.log(`[socket] reconnect in ${Math.round(jitter)}ms (attempt ${reconnectAttempts + 1})`);

  reconnectTimer = setTimeout(() => {
    reconnectAttempts++;
    connect(authToken);
  }, jitter);
};

const sendRaw = (data) => {
  if (!socketTask) {
    return false;
  }
  try {
    socketTask.send({ data: JSON.stringify(data) });
    return true;
  } catch (e) {
    console.error('[socket] send error:', e);
    return false;
  }
};

const send = (data) => {
  if (isConnected()) {
    return sendRaw(data);
  }
  pendingQueue.push(data);
  return false;
};

const connect = (token) => {
  if (!token) {
    return;
  }

  authToken = token;

  if (socketTask) {
    try {
      socketTask.close();
    } catch (e) {
      // ignore
    }
    socketTask = null;
  }

  clearTimers();

  state = STATE.CONNECTING;
  authed = false;
  emit('stateChange', state);

  socketTask = wx.connectSocket({
    url: config.WS_URL,
    fail: (err) => {
      console.error('[socket] connect fail:', err);
      state = STATE.DISCONNECTED;
      emit('stateChange', state);
      scheduleReconnect();
    }
  });

  socketTask.onOpen(() => {
    console.log('[socket] connection opened');
    state = STATE.CONNECTED;
    emit('stateChange', state);

    sendRaw({ type: 'auth', token: authToken });
    startHeartbeat();
  });

  socketTask.onMessage((res) => {
    let data;
    try {
      data = JSON.parse(res.data);
    } catch (e) {
      return;
    }

    switch (data.type) {
      case 'auth':
        if (data.success) {
          authed = true;
          reconnectAttempts = 0;
          flushQueue();
          console.log('[socket] auth success');
          emit('auth', { success: true, userId: data.userId });
        } else {
          authed = false;
          console.error('[socket] auth failed');
          emit('auth', { success: false });
          disconnect();
        }
        break;

      case 'pong':
        clearTimeout(heartbeatTimeoutTimer);
        break;

      case 'message':
        clearTimeout(heartbeatTimeoutTimer);
        emit('message', data.data);
        break;

      case 'reveal':
        emit('reveal', data.data);
        break;

      case 'read_ack':
        emit('readAck', data.data);
        break;

      case 'tempNickname':
        emit('tempNickname', data.data);
        break;

      case 'unread':
        emit('unread', data.data);
        break;

      case 'resonance_notify':
        emit('resonanceNotify', data.data);
        break;

      case 'error':
        console.error('[socket] server error:', data.message);
        emit('error', data);
        break;

      default:
        break;
    }
  });

  socketTask.onClose((res) => {
    console.log('[socket] closed, code:', res.code);
    state = STATE.DISCONNECTED;
    authed = false;
    emit('stateChange', state);
    clearTimers();

    if (res.code !== 1000 && authToken) {
      scheduleReconnect();
    }
  });

  socketTask.onError((err) => {
    console.error('[socket] error:', err);
    state = STATE.DISCONNECTED;
    authed = false;
    emit('stateChange', state);
  });
};

const disconnect = () => {
  authToken = null;
  clearTimers();
  reconnectAttempts = 0;
  pendingQueue = [];

  if (socketTask) {
    try {
      socketTask.close({ code: 1000, reason: 'client disconnect' });
    } catch (e) {
      // ignore
    }
    socketTask = null;
  }

  state = STATE.DISCONNECTED;
  authed = false;
  emit('stateChange', state);
};

const sendMessage = ({ receiverId, senderDynamicTag, content, postId, tempNickname }) => {
  return send({
    type: 'message',
    receiverId,
    senderDynamicTag,
    content,
    postId: postId || undefined,
    tempNickname: tempNickname || undefined
  });
};

const sendReadAck = (conversationId) => {
  return send({
    type: 'read_ack',
    conversationId
  });
};

const sendTempNickname = ({ otherUserId, tempNickname }) => {
  return send({
    type: 'temp_nickname',
    otherUserId,
    tempNickname
  });
};

module.exports = {
  STATE,
  connect,
  disconnect,
  send,
  sendMessage,
  sendReadAck,
  sendTempNickname,
  on,
  off,
  getState,
  isConnected
};
