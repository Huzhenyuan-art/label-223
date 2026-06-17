const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  process.env.MONGO_URI = mongoUri;
  process.env.JWT_SECRET = 'echo-island-test-secret-key-for-testing';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.RECOMMENDATION_ENABLED = 'false';
  process.env.RECOMMENDATION_SCHEDULER_ENABLED = 'false';

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  });
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      try {
        await collections[key].deleteMany({});
      } catch (e) {
        // ignore
      }
    }
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});
