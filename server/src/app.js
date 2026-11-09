require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const path = require("path");

const {
  authLimiter,
  apiLimiter,
  uploadLimiter,
} = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const requestLogger = require("./middleware/requestLogger");

const app = express();

// WHY trust proxy? Render/Vercel sit behind load balancers.
// Without this, req.ip shows the LB IP, breaking IP-based rate limiting.
app.set("trust proxy", 1);

// Helmet sets 15 security headers in one call (HSTS, CSP, X-Frame-Options…)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // allow heatmap images
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  }),
);

// CORS — strict allowlist. Only our React origin gets through.
const ALLOWED = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());
app.use(
  cors({
    origin: (origin, cb) =>
      !origin || ALLOWED.includes(origin)
        ? cb(null, true)
        : cb(new Error(`CORS blocked: ${origin}`)),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // cache preflight 24h — reduces OPTIONS round-trips
  }),
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// NoSQL injection prevention — strips $ and . from query inputs
app.use(mongoSanitize({ replaceWith: "_" }));

// HTTP Parameter Pollution — prevents ?role=user&role=admin attacks
app.use(hpp({ whitelist: ["tags", "sort"] }));

app.use(compression({ level: 6, threshold: 1024 }));
app.use(requestLogger);

// Serve heatmap images directly from Node (small static files)
// Restricted specifically to heatmaps — NEVER expose uploads/temp to public access
app.use(
  "/uploads/heatmaps",
  express.static(path.join(__dirname, "../uploads/heatmaps"), { maxAge: "7d" }),
);

// Clean any orphaned temp files on startup and periodically (non-blocking, unref)
const { startPeriodicTempCleaner } = require("./utils/tempCleaner");
startPeriodicTempCleaner();

// Rate limiters scoped to their risk level
app.use("/api/auth", authLimiter); // auth brute-force protection
app.use("/api", apiLimiter); // general API rate limiter

// Feature routes
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/detect", require("./routes/detection.routes"));
app.use("/api/history", require("./routes/history.routes"));
app.use("/api/reports", require("./routes/report.routes"));
app.use("/api/admin", require("./routes/admin.routes"));

app.get("/api/health", (req, res) =>
  res.json({
    status: "healthy",
    env: process.env.NODE_ENV,
    ts: new Date().toISOString(),
  }),
);

app.use("*", (req, res) =>
  res
    .status(404)
    .json({
      success: false,
      message: `${req.method} ${req.originalUrl} not found`,
    }),
);

app.use(errorHandler);

module.exports = app;
