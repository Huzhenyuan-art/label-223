const userRoutes = require('./userRoutes');
const feedRoutes = require('./feedRoutes');
const postRoutes = require('./postRoutes');
const messageRoutes = require('./messageRoutes');
const paymentRoutes = require('./paymentRoutes');
const commerceRoutes = require('./commerceRoutes');
const uploadRoutes = require('./uploadRoutes');
const privateGroupRoutes = require('./privateGroupRoutes');
const auditRoutes = require('./auditRoutes');
const recommendationRoutes = require('./recommendationRoutes');
const tagChannelRoutes = require('./tagChannelRoutes');

module.exports = (app) => {
  app.use('/api/users', userRoutes);
  app.use('/api/feed', feedRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/commerce', commerceRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/private-groups', privateGroupRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/recommendation', recommendationRoutes);
  app.use('/api/tags', tagChannelRoutes);
};
