const logger = require("../utils/logger");

// WHY a centralised error handler?
// Single point to: log errors, sanitise messages for production,
// map known error types (Mongoose, JWT, Multer, Axios) to HTTP codes.
const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message, stack: err.stack,
    method: req.method, path: req.path, userId: req.user?.id,
  });

  if (err.name === "CastError")
    return res.status(400).json({ success: false, message: `Invalid ID: ${err.value}` });

  if (err.name === "ValidationError")
    return res.status(400).json({
      success: false, message: "Validation failed",
      errors: Object.values(err.errors).map(e => e.message),
    });

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ success: false, message: `${field} already exists.` });
  }

  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ success: false, message: "File exceeds maximum size." });

  if (err.code === "INVALID_FILE_EXTENSION" || err.message === "File extension not allowed")
    return res.status(415).json({ success: false, message: "File extension not allowed.", code: "INVALID_FILE_EXTENSION" });

  if (err.name === "JsonWebTokenError")
    return res.status(401).json({ success: false, message: "Invalid token.", code: "TOKEN_INVALID" });

  if (err.name === "TokenExpiredError")
    return res.status(401).json({ success: false, message: "Token expired.", code: "TOKEN_EXPIRED" });

  if (err.isAxiosError) {
    if (err.code === "ECONNREFUSED")
      return res.status(502).json({ success: false, message: "AI service is not running. Please try again." });
    if (err.code === "ECONNABORTED")
      return res.status(504).json({ success: false, message: "AI analysis timed out. Try a shorter clip." });
    return res.status(502).json({
      success: false, message: "AI service error.",
      detail: err.response?.data?.detail || err.message,
    });
  }

  const isDev = process.env.NODE_ENV === "development";
  res.status(err.statusCode || 500).json({
    success: false,
    message: isDev ? err.message : "Internal server error.",
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = errorHandler;
