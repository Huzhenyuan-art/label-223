const config = require('../config/index');

let socketTask = null;
let connected = false;
let messageHandler = null;

const connect = (token) => {
  if (!token) {
    return;
  }

  if (socketTask) {
    socketTask.close();
  }

  socketTask = wx.connectSocket({
    url: config.WS_URL
  });

  socketTask.onOpen(() => {
    connected = true;
    send({ type: 'auth', token });
  });

  socketTask.onMessage((res) => {
    try {
      const data = JSON.parse(res.data);
      if (data.type === 'message' && typeof messageHandler === 'function') {
        messageHandler(data.data);
      }
    } catch (error) {
      // keep silent for malformed message
    }
  });

  socketTask.onClose(() => {
    connected = false;
  });

  socketTask.onError(() => {
    connected = false;
  });
};

const send = (data) => {
  if (!socketTask || !connected) {
    return;
  }

  socketTask.send({
    data: JSON.stringify(data)
  });
};

const onMessage = (handler) => {
  messageHandler = handler;
};

const disconnect = () => {
  if (socketTask) {
    socketTask.close();
    socketTask = null;
  }
  connected = false;
};

module.exports = {
  connect,
  send,
  onMessage,
  disconnect
};
