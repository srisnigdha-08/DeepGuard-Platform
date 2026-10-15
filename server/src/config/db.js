const dns = require("dns");

// Force Node to use Google DNS only for external Atlas connections
if (process.env.NODE_ENV !== "test" && !process.env.MONGODB_URI?.includes("127.0.0.1") && !process.env.MONGODB_URI?.includes("localhost")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set");
  mongoose.set("strictQuery", true);

  // WHY retry loop? Atlas M0 free tier can take up to 10s to wake.
  // Retrying 5× with 5s delay covers cold starts without crashing the app.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4, // force IPv4 — avoids DNS resolution delays on some hosts
      });
      mongoose.connection.on("disconnected", () =>
        logger.warn("MongoDB disconnected"),
      );
      mongoose.connection.on("error", (err) =>
        logger.error("MongoDB error:", err),
      );
      logger.info("MongoDB Atlas connected");
      return;
    } catch (err) {
      logger.error(`MongoDB attempt ${attempt}/5 failed: ${err.message}`);
      if (attempt === 5) throw err;
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
};

module.exports = { connectDB };
