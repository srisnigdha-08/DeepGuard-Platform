const winston = require("winston");
const DRF     = require("winston-daily-rotate-file");
const { combine, timestamp, errors, json, colorize, simple } = winston.format;

// WHY Winston over console.log?
// - Structured JSON logs → searchable in log aggregators (Datadog, Loki)
// - Daily rotation → disk doesn't fill up over months
// - Level filtering → DEBUG in dev, INFO in prod
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(errors({ stack: true }), timestamp(), json()),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === "development" ? combine(colorize(), simple()) : json(),
    }),
    new DRF({ filename: "logs/error-%DATE%.log",    datePattern: "YYYY-MM-DD", level: "error", maxSize: "20m", maxFiles: "30d" }),
    new DRF({ filename: "logs/combined-%DATE%.log", datePattern: "YYYY-MM-DD",                maxSize: "50m", maxFiles: "14d" }),
  ],
  exitOnError: false,
});

module.exports = logger;
