const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

const handler = (req, res, _next, opts) => {
  logger.warn(`Rate limit hit: ${req.ip} -> ${req.path}`);
  const retryAfterSec = Math.ceil(opts.windowMs / 1000);
  res.setHeader("Retry-After", String(retryAfterSec));
  res.status(opts.statusCode).json({
    success: false,
    message: opts.message,
    retryAfter: `${Math.ceil(opts.windowMs / 60000)} min`,
  });
};

// 1. Auth Rate Limiter — Brute force protection on login/register
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || (process.env.NODE_ENV === "test" ? 200 : 15),
  message: "Too many auth attempts. Please wait 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: true,
});

// 2. Detection Rate Limiter — Protects expensive GPU/CPU model inference
const createDetectionLimiter = (options = {}) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max:
      options.max ||
      parseInt(process.env.DETECTION_RATE_LIMIT_MAX, 10) ||
      (process.env.NODE_ENV === "test" ? 200 : 30),
    message: "Detection request limit reached. Max 30 analyses per 15 minutes.",
    standardHeaders: true,
    legacyHeaders: false,
    handler,
    keyGenerator: (req) => (req.user?.id ? `user_${req.user.id}` : req.ip),
    ...options,
  });

const uploadLimiter = createDetectionLimiter();

// 3. General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || (process.env.NODE_ENV === "test" ? 500 : 200),
  message: "Too many requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = {
  authLimiter,
  apiLimiter,
  uploadLimiter,
  detectionLimiter: uploadLimiter,
  createDetectionLimiter,
};
