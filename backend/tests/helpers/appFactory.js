const express = require('express');
const setupRoutes = require('../../src/routes');
const { notFoundHandler, globalErrorHandler } = require('../../src/middlewares/errorHandler');

const createTestApp = () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok' } });
  });

  setupRoutes(app);

  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
};

module.exports = { createTestApp };
