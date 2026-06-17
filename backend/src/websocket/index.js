const WebSocket = require('ws');
const { Message, User } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const { verifyToken } = require('../utils/auth');
const {
  setClientsRef,
  sendToUser,
  pushUnread,
  getUnreadAggregation
} = require('./wsHelpers');
const {
  handleSendMessage,
  handleReadAck,
  handleTempNickname
} = require('./messageHandler');
const notificationService = require('../services/notificationService');

const clients = new Map();

const _handleAuth = async (ws, msg) => {
  const payload = verifyToken(msg.token);
  const user = payload?.sub ? await User.findById(payload.sub) : null;
  if (!user) {
    ws.send(JSON.stringify({ type: 'auth', success: false }));
    return null;
  }

  const authedUserId = user._id.toString();
  const previousSocket = clients.get(authedUserId);
  if (previousSocket && previousSocket !== ws) {
    previousSocket.close();
  }
  clients.set(authedUserId, ws);
  ws.send(JSON.stringify({ type: 'auth', success: true, userId: authedUserId }));
  logger.info(`WebSocket auth success: ${authedUserId}`);
  pushUnread(authedUserId).catch((e) =>
    logger.error(`Push unread on auth error: ${e.message}`)
  );
  notificationService.pushNotificationUnread(authedUserId).catch((e) =>
    logger.error(`Push notification unread on auth error: ${e.message}`)
  );
  return authedUserId;
};

const setupWebSocket = (server) => {
  setClientsRef(clients);

  const wss = new WebSocket.Server({ server, path: config.wsPath });

  wss.on('connection', (ws) => {
    let authedUserId = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'auth') {
          authedUserId = await _handleAuth(ws, msg);
          return;
        }

        if (!authedUserId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized websocket' }));
          return;
        }

        switch (msg.type) {
          case 'message':
            await handleSendMessage(ws, authedUserId, msg);
            return;

          case 'read_ack':
            await handleReadAck(ws, authedUserId, msg);
            return;

          case 'temp_nickname':
            await handleTempNickname(ws, authedUserId, msg);
            return;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            return;

          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown websocket event' }));
        }
      } catch (error) {
        logger.error(`WebSocket message error: ${error.message}`);
        ws.send(JSON.stringify({ type: 'error', message: 'WebSocket message failed' }));
      }
    });

    ws.on('close', () => {
      if (authedUserId) {
        clients.delete(authedUserId);
      }
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error: ${error.message}`);
    });
  });

  setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 30000);

  logger.info('WebSocket server initialized');
};

module.exports = {
  setupWebSocket,
  sendToUser,
  pushUnread,
  getUnreadAggregation
};
