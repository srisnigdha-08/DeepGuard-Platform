const mongoose = require("mongoose");
const User = require("../src/models/User");
const DetectionResult = require("../src/models/DetectionResult");
const {
  validateTestDatabaseURI,
  assertSafeConnection,
  getSafeTestURI,
} = require("./testDbGuard");

const connectTestDB = async () => {
  // 1. Explicitly retrieve and validate test URI before connecting
  const testUri = getSafeTestURI();
  validateTestDatabaseURI(testUri);

  // 2. Connect only if not already connected
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(testUri, {
      serverSelectionTimeoutMS: 5000,
    });
  }

  // 3. Post-connection assertion to verify connected host and db identity
  assertSafeConnection(mongoose.connection);
};

const clearTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    // 4. Revalidate database identity before any destructive cleanup operations
    assertSafeConnection(mongoose.connection);
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

module.exports = {
  connectTestDB,
  clearTestDB,
  disconnectTestDB,
  getSafeTestURI,
  validateTestDatabaseURI,
  assertSafeConnection,
};
