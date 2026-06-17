const express = require('express');
const setupRoutes = require('../../src/routes');

const createTestApp = () => {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({ code: 0, data: { status: 'ok' } });
  });

  setupRoutes(app);

  app.use((req, res) => {
    res.status(404).json({ code: 1, message: 'Not Found' });
  });

  app.use((err, req, res, next) => {
    res.status(500).json({ code: 1, message: 'Internal server error', error: err.message });
  });

  return app;
};

module.exports = { createTestApp };
