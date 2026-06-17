const WebSocket = require('ws');
const mongoose = require('mongoose');
const { Message } = require('../models');

let clientsRef = null;

const setClientsRef = (ref) => {
  clientsRef = ref;
};

const sendToUser = (userId, payload) => {
  if (!clientsRef) return false;
  const socket = clientsRef.get(userId.toString());
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
    return true;
  }
  return false;
};

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

module.exports = {
  setClientsRef,
  sendToUser,
  pushUnread,
  getUnreadAggregation
};
