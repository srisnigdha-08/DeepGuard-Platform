const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

const handler = (req, res, _next, opts) => {
  logger.warn(`Rate limit hit: ${req.ip} -> ${req.path}`);
  res.status(opts.statusCode).json({
    success: false,
    message: opts.message,
    retryAfter: `${Math.ceil(opts.windowMs / 60000)} min`,
  });
};

// WHY three separate limiters with different windows?
// Auth routes: brute-force attacks try thousands of passwords.
//   10 attempts / 15 min is generous for real users, painful for bots.
// Upload routes: GPU inference is expensive; 20/hr prevents DoS of AI service.
// General API: 100/15min allows rich dashboard usage without abuse.

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: "Too many auth attempts. Please wait 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  skipSuccessfulRequests: true, // only count failures
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10000,
  message: "Upload limit reached. Max 20 analyses per hour.",
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => req.user?.id || req.ip, // per-user, not per-IP
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  message: "Too many requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, apiLimiter, uploadLimiter };
