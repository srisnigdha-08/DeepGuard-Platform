const logger = require("../utils/logger");

let activeDetections = 0;

/**
 * Concurrency limiter middleware.
 * Ensures the Node.js server does not overload the AI service with too many
 * parallel heavy inference workloads simultaneously.
 */
const createConcurrencyLimiter = (options = {}) => {
  const maxConcurrent =
    options.maxConcurrent ||
    parseInt(process.env.MAX_CONCURRENT_DETECTIONS, 10) ||
    (process.env.NODE_ENV === "test" ? 50 : 5);

  return (req, res, next) => {
    if (activeDetections >= maxConcurrent) {
      logger.warn(
        `Concurrency limit exceeded: ${activeDetections}/${maxConcurrent} active. Rejecting request from ${req.ip}`
      );
      res.setHeader("Retry-After", "5");
      return res.status(429).json({
        success: false,
        message:
          "AI engine is currently processing maximum concurrent requests. Please retry in a few moments.",
        retryAfter: "5 seconds",
      });
    }

    activeDetections++;
    let released = false;

    const release = () => {
      if (!released) {
        released = true;
        activeDetections = Math.max(0, activeDetections - 1);
      }
    };

    res.on("finish", release);
    res.on("close", release);

    next();
  };
};

const getActiveDetections = () => activeDetections;
const setActiveDetections = (count) => {
  activeDetections = count;
};
const resetActiveDetections = () => {
  activeDetections = 0;
};

module.exports = {
  concurrencyLimiter: createConcurrencyLimiter(),
  createConcurrencyLimiter,
  getActiveDetections,
  setActiveDetections,
  resetActiveDetections,
};
