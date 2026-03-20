/* ./utils/db.js */
const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mailgpt', {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log('✅  MongoDB connected');
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.warn('⚠️  MongoDB disconnected — will reconnect on next request');
    });
  } catch (err) {
    console.error('❌  MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };