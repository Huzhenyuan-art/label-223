const WebSocket = require('ws');
const mongoose = require('mongoose');
const { Message, User, Post, Resonance, RevealDecision } = require('../models');
const logger = require('../utils/logger');
const config = require('../config');
const { verifyToken } = require('../utils/auth');
const { auditMultipleFields } = require('../services/auditService');
const notificationService = require('../services/notificationService');

const clients = new Map();

const getUnreadAggregation = async (userId) => {
  const rows = await Message.aggregate([
    { $match: { receiver: new mongoose.Types.ObjectId(userId), read: false } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } }
  ]);
  const conversations = {};
  let total = 0;
  for (const row of rows) {
    conversations[row._id] = row.count;
    total += row.count;
  }
  return { total, conversations };
};

const pushUnread = async (userId) => {
  const agg = await getUnreadAggregation(userId);
  sendToUser(userId.toString(), { type: 'unread', data: agg });
  return agg;
};

const sendToUser = (userId, payload) => {
  const socket = clients.get(userId.toString());
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
};

const setupWebSocket = (server) => {
  const wss = new WebSocket.Server({ server, path: config.wsPath });

  wss.on('connection', (ws) => {
    let authedUserId = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'auth') {
          const payload = verifyToken(msg.token);
          const user = payload?.sub ? await User.findById(payload.sub) : null;
          if (!user) {
            ws.send(JSON.stringify({ type: 'auth', success: false }));
            return;
          }

          authedUserId = user._id.toString();
          const previousSocket = clients.get(authedUserId);
          if (previousSocket && previousSocket !== ws) {
            previousSocket.close();
          }
          clients.set(authedUserId, ws);
          ws.send(JSON.stringify({ type: 'auth', success: true, userId: authedUserId }));
          logger.info(`WebSocket auth success: ${authedUserId}`);
          pushUnread(authedUserId).catch((e) => logger.error(`Push unread on auth error: ${e.message}`));
          notificationService.pushNotificationUnread(authedUserId).catch((e) =>
            logger.error(`Push notification unread on auth error: ${e.message}`)
          );
          return;
        }

        if (msg.type === 'message') {
          if (!authedUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized websocket' }));
            return;
          }

          const receiver = await User.findById(msg.receiverId);
          if (!receiver) {
            ws.send(JSON.stringify({ type: 'error', message: 'Receiver not found' }));
            return;
          }

          const conversationId = Message.generateConversationId(authedUserId, msg.receiverId);
          const existingCount = await Message.countDocuments({ conversationId });

          let sourcePost = null;
          if (msg.postId) {
            const source = await Post.findById(msg.postId).select('author');
            if (!source) {
              ws.send(JSON.stringify({ type: 'error', message: 'Referenced post not found' }));
              return;
            }
            sourcePost = source._id;
          }

          if (existingCount === 0) {
            if (!msg.postId) {
              ws.send(JSON.stringify({ type: 'error', message: 'First private wave must be from resonated post' }));
              return;
            }

            const source = await Post.findById(msg.postId).select('author');
            if (!source) {
              ws.send(JSON.stringify({ type: 'error', message: 'Referenced post not found' }));
              return;
            }

            if (source.author.toString() !== msg.receiverId) {
              ws.send(JSON.stringify({ type: 'error', message: 'Target must be resonated post author' }));
              return;
            }

            const resonated = await Resonance.exists({ post: source._id, user: authedUserId });
            if (!resonated) {
              ws.send(JSON.stringify({ type: 'error', message: 'Please resonate before private wave' }));
              return;
            }
          }

          const auditResult = await auditMultipleFields({
            fieldsMap: {
              senderDynamicTag: msg.senderDynamicTag,
              content: msg.content
            },
            type: 'message',
            userId: authedUserId,
            targetId: conversationId
          });

          if (auditResult.blocked) {
            ws.send(JSON.stringify({
              type: 'error',
              message: '消息包含违规信息，无法发送',
              matchedWords: auditResult.matchedWords
            }));
            return;
          }

          const finalFields = auditResult.maskedFieldsMap || {
            senderDynamicTag: msg.senderDynamicTag,
            content: msg.content
          };

          const created = await Message.create({
            conversationId,
            sender: authedUserId,
            receiver: msg.receiverId,
            senderDynamicTag: finalFields.senderDynamicTag,
            content: finalFields.content,
            sourcePost
          });

          await created.populate([
            { path: 'sender', select: 'nickname avatar' },
            { path: 'receiver', select: 'nickname avatar' },
            { path: 'sourcePost', select: 'title dynamicTag' }
          ]);

          if (msg.tempNickname && typeof msg.tempNickname === 'string') {
            const trimmed = msg.tempNickname.trim().slice(0, 24);
            if (trimmed) {
              const nicknameAudit = await auditMultipleFields({
                fieldsMap: { tempNickname: trimmed },
                type: 'tempNickname',
                userId: authedUserId,
                targetId: conversationId
              });
              if (!nicknameAudit.blocked) {
                const finalNickname = (nicknameAudit.maskedFieldsMap?.tempNickname || trimmed).slice(0, 24);
                await RevealDecision.findOneAndUpdate(
                  { conversationId },
                  {
                    $setOnInsert: {
                      users: [authedUserId, msg.receiverId],
                      revealed: false,
                      unlockedAt: null,
                      agreedBy: []
                    },
                    $set: {
                      [`tempNicknames.${authedUserId}`]: finalNickname
                    }
                  },
                  { upsert: true, new: true }
                );
              }
            }
          }

          const payload = {
            type: 'message',
            data: created,
            auditInfo: {
              action: auditResult.action,
              matchedWords: auditResult.matchedWords
            }
          };
          ws.send(JSON.stringify(payload));
          sendToUser(msg.receiverId, payload);
          pushUnread(msg.receiverId).catch((e) => logger.error(`Push unread on message error: ${e.message}`));

          const newCount = existingCount + 1;
          if (newCount >= 6) {
            const [idA, idB] = conversationId.split('_');
            const otherUserId = idA === authedUserId ? idB : idA;
            const counts = await Message.aggregate([
              { $match: { conversationId } },
              { $group: { _id: '$sender', count: { $sum: 1 } } }
            ]);
            const countMap = new Map(counts.map((item) => [item._id.toString(), item.count]));
            const myCount = countMap.get(authedUserId) || 0;
            const otherCount = countMap.get(otherUserId) || 0;
            if (myCount >= 3 && otherCount >= 3) {
              const revealPayload = {
                type: 'reveal',
                data: {
                  conversationId,
                  eligible: true,
                  myCount,
                  otherCount,
                  revealed: false
                }
              };
              ws.send(JSON.stringify(revealPayload));
              sendToUser(otherUserId, revealPayload);
            }
          }

          return;
        }

        if (msg.type === 'read_ack') {
          if (!authedUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized websocket' }));
            return;
          }

          if (!msg.conversationId) {
            return;
          }

          const result = await Message.updateMany(
            { conversationId: msg.conversationId, receiver: authedUserId, read: false },
            { read: true }
          );

          const [idA, idB] = msg.conversationId.split('_');
          const otherUserId = idA === authedUserId ? idB : idA;

          sendToUser(otherUserId, {
            type: 'read_ack',
            data: {
              conversationId: msg.conversationId,
              readCount: result.modifiedCount
            }
          });

          pushUnread(authedUserId).catch((e) => logger.error(`Push unread on read_ack error: ${e.message}`));
          pushUnread(otherUserId).catch((e) => logger.error(`Push unread on read_ack other error: ${e.message}`));

          return;
        }

        if (msg.type === 'temp_nickname') {
          if (!authedUserId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized websocket' }));
            return;
          }

          const otherUserId = msg.otherUserId;
          if (!otherUserId || authedUserId === otherUserId.toString()) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid target user' }));
            return;
          }

          const otherUser = await User.findById(otherUserId);
          if (!otherUser) {
            ws.send(JSON.stringify({ type: 'error', message: 'Other user not found' }));
            return;
          }

          const trimmed = (msg.tempNickname || '').toString().trim().slice(0, 24);
          if (!trimmed) {
            ws.send(JSON.stringify({ type: 'error', message: 'tempNickname cannot be empty' }));
            return;
          }

          const conversationId = Message.generateConversationId(authedUserId, otherUserId);
          const decision = await RevealDecision.findOne({ conversationId });

          if (decision && decision.revealed) {
            ws.send(JSON.stringify({ type: 'error', message: '身份已揭示，无需设置临时昵称' }));
            return;
          }

          const auditResult = await auditMultipleFields({
            fieldsMap: { tempNickname: trimmed },
            type: 'tempNickname',
            userId: authedUserId,
            targetId: conversationId
          });

          if (auditResult.blocked) {
            ws.send(JSON.stringify({
              type: 'error',
              message: '临时昵称包含违规信息',
              matchedWords: auditResult.matchedWords
            }));
            return;
          }

          const finalNickname = (auditResult.maskedFieldsMap?.tempNickname || trimmed).slice(0, 24);

          const updated = await RevealDecision.findOneAndUpdate(
            { conversationId },
            {
              $setOnInsert: {
                users: [authedUserId, otherUserId],
                revealed: false,
                unlockedAt: null,
                agreedBy: []
              },
              $set: {
                [`tempNicknames.${authedUserId}`]: finalNickname
              }
            },
            { upsert: true, new: true }
          ).lean();

          const tempNicknamesRaw = updated?.tempNicknames instanceof Map
            ? Object.fromEntries(updated.tempNicknames)
            : updated?.tempNicknames || {};

          const nicknamePayload = {
            type: 'tempNickname',
            data: {
              conversationId,
              fromUserId: authedUserId,
              tempNickname: finalNickname,
              tempNicknames: { ...tempNicknamesRaw, [authedUserId]: finalNickname }
            }
          };
          ws.send(JSON.stringify(nicknamePayload));
          sendToUser(otherUserId.toString(), nicknamePayload);

          return;
        }

        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        ws.send(JSON.stringify({ type: 'error', message: 'Unknown websocket event' }));
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

module.exports = { setupWebSocket, sendToUser, pushUnread, getUnreadAggregation };
