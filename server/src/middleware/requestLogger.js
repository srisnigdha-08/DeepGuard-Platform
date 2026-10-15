const logger = require("../utils/logger");

module.exports = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const d = {
      method: req.method, path: req.path, status: res.statusCode,
      ms: Date.now() - start, ip: req.ip, user: req.user?.id || "anon",
    };
    // Warn on slow requests (> 5 s)
    if (d.ms > 5000) logger.warn("Slow request", d);
    else if (d.status >= 400) logger.warn("Request failed", d);
    else logger.info("Request OK", d);
  });
  next();
};
