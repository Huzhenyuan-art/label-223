const socket = require('./socket');

const createSocketManager = (pageRef) => {
  const handlers = {};
  let bound = false;

  const bind = (events) => {
    if (bound) return;
    Object.keys(events).forEach((event) => {
      const handler = events[event];
      if (typeof handler !== 'function') return;
      handlers[event] = handler;
      socket.on(event, handler);
    });
    bound = true;
  };

  const unbind = () => {
    if (!bound) return;
    Object.keys(handlers).forEach((event) => {
      socket.off(event, handlers[event]);
    });
    Object.keys(handlers).forEach((k) => delete handlers[k]);
    bound = false;
  };

  return { bind, unbind };
};

const bindSocketLifecycle = (pageRef, events) => {
  const manager = createSocketManager(pageRef);
  const originalOnShow = pageRef.onShow;
  const originalOnHide = pageRef.onHide;
  const originalOnUnload = pageRef.onUnload;

  pageRef.onShow = function () {
    manager.bind(events);
    return originalOnShow?.apply(this, arguments);
  };

  pageRef.onHide = function () {
    manager.unbind();
    return originalOnHide?.apply(this, arguments);
  };

  pageRef.onUnload = function () {
    manager.unbind();
    return originalOnUnload?.apply(this, arguments);
  };

  return manager;
};

module.exports = {
  createSocketManager,
  bindSocketLifecycle
};
