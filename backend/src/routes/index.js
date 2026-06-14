const userRoutes = require('./userRoutes');
const feedRoutes = require('./feedRoutes');
const postRoutes = require('./postRoutes');
const messageRoutes = require('./messageRoutes');
const paymentRoutes = require('./paymentRoutes');
const commerceRoutes = require('./commerceRoutes');

module.exports = (app) => {
  app.use('/api/users', userRoutes);
  app.use('/api/feed', feedRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/commerce', commerceRoutes);
};
