require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const setupRoutes = require('./routes');
const { setupWebSocket } = require('./websocket');
const { ensureDir } = require('./utils/storage');
const recommendation = require('./services/recommendation');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.resolve(process.cwd(), config.storage.local.uploadDir);
ensureDir(uploadDir);
app.use('/uploads', express.static(uploadDir, {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    }
  }
}));

app.get('/health', (req, res) => {
  res.json({
    code: 0,
    data: {
      status: 'ok',
      service: 'echo-island-backend',
      timestamp: new Date().toISOString()
    }
  });
});

setupRoutes(app);

app.use((req, res) => {
  res.status(404).json({ code: 1, message: 'Not Found' });
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ code: 1, message: 'Internal server error' });
});

const start = async () => {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    logger.info('MongoDB connected');

    await recommendation.initialize();

    setupWebSocket(server);

    server.listen(config.port, '0.0.0.0', () => {
      logger.info(`Echo Island API started at :${config.port}`);
    });
  } catch (error) {
    logger.error(`Server start failed: ${error.message}`);
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  recommendation.shutdown();
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

start();
