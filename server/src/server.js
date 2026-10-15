require("dotenv").config();
const http = require("http");
const app  = require("./app");
const { connectDB } = require("./config/db");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 5000;

async function startServer() {
  const required = ["MONGODB_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    process.exit(1);
  }

  await connectDB();
  logger.info("MongoDB connected");

  const server = http.createServer(app);
  // WHY these timeouts? Render free tier keeps connections alive longer than
  // Node's default 5s. Without this, clients get ECONNRESET mid-request.
  server.keepAliveTimeout = 120_000;
  server.headersTimeout   = 121_000;

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
    logger.info(`Health: http://localhost:${PORT}/api/health`);
  });

  const shutdown = sig => {
    logger.info(`${sig} received — shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15_000);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));
}

process.on("unhandledRejection", err => {
  logger.error("Unhandled rejection:", err);
  process.exit(1);
});

startServer().catch(err => {
  logger.error("Startup failed:", err);
  process.exit(1);
});
