const mongoose = require('mongoose');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/echo_island';
const timeout = Number(process.env.MONGO_WAIT_TIMEOUT || 60000);
const interval = 2000;

let startTime = Date.now();
let attempt = 0;

async function tryConnect() {
  attempt++;
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000
    });
    console.log(`MongoDB connected successfully (attempt ${attempt})`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      console.error(`MongoDB connection failed after ${attempt} attempts (${(elapsed / 1000).toFixed(1)}s): ${err.message}`);
      process.exit(1);
    }
    console.log(`Waiting for MongoDB... attempt ${attempt} (${(elapsed / 1000).toFixed(1)}s elapsed)`);
    setTimeout(tryConnect, interval);
  }
}

console.log(`Waiting for MongoDB at: ${mongoUri}`);
tryConnect();
