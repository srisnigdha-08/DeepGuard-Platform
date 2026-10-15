const mongoose = require("mongoose");
const User = require("../src/models/User");
const DetectionResult = require("../src/models/DetectionResult");

const TEST_DB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/deepfake_test";

const connectTestDB = async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  }
};

const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({});
    await DetectionResult.deleteMany({});
  }
};

const disconnectTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await clearTestDB();
    await mongoose.connection.close();
  }
};

module.exports = { connectTestDB, clearTestDB, disconnectTestDB };
