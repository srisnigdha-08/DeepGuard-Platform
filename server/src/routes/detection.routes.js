const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const { authenticate } = require("../middleware/auth");
const { detectionLimiter } = require("../middleware/rateLimiter");
const { concurrencyLimiter } = require("../middleware/concurrencyLimiter");
const ctrl = require("../controllers/detection.controller");

const router = express.Router();

const {
  registerActiveTempFile,
  unregisterActiveTempFile,
} = require("../utils/tempCleaner");

// WHY disk storage over memory storage?
// Video files can be 500MB. Loading them into Node.js memory would OOM the server.
// Disk storage streams directly to /uploads/temp — only a file descriptor in RAM.
const storage = multer.diskStorage({
  destination: (_, __, cb) =>
    cb(null, path.join(__dirname, "../../uploads/temp")),
  filename: (req, file, cb) => {
    const ext = path.extname(path.basename(file.originalname || "")).toLowerCase();
    const finalFilename = `${uuidv4()}${ext}`;
    const fullPath = path.join(__dirname, "../../uploads/temp", finalFilename);
    req._inFlightUploadPath = fullPath;
    registerActiveTempFile(fullPath);
    cb(null, finalFilename);
  },
});

// Whitelist of permitted extensions as a secondary check
const allowedExt = /\.(jpe?g|png|webp|mp4|avi|mov|mp3|wav|flac)$/i;
const fileFilter = (_, file, cb) => {
  const safeName = path.basename(file.originalname || "");
  const ext = path.extname(safeName);
  if (allowedExt.test(ext)) {
    return cb(null, true);
  }
  const err = new Error("File extension not allowed");
  err.statusCode = 415;
  err.code = "INVALID_FILE_EXTENSION";
  return cb(err, false);
};

// Cleans up partial disk file if the client aborts or closes before Multer upload finishes
const abortUploadCleaner = (req, res, next) => {
  const cleanupPartial = () => {
    if (!req.complete && req._inFlightUploadPath) {
      unregisterActiveTempFile(req._inFlightUploadPath);
      try {
        if (fs.existsSync(req._inFlightUploadPath)) {
          fs.unlinkSync(req._inFlightUploadPath);
        }
      } catch (_) {}
    }
  };

  req.on("aborted", cleanupPartial);
  res.on("close", cleanupPartial);
  next();
};

const upload = (maxMB) =>
  multer({ storage, fileFilter, limits: { fileSize: maxMB * 1024 * 1024 } });

// All detection routes require authentication
router.use(authenticate);

// Enforce detection rate limiting, concurrent inference bounds, and upload abort tracking
const inferenceGuards = [detectionLimiter, concurrencyLimiter, abortUploadCleaner];

// WHY different max sizes? 20MB is ample for any single JPEG/PNG.
// 500MB supports up to ~2-min 1080p video at 35 Mbps.
// 50MB covers 30s of uncompressed 48kHz audio.
router.post("/image", inferenceGuards, upload(20).single("file"), ctrl.analyzeImage);
router.post("/video", inferenceGuards, upload(500).single("file"), ctrl.analyzeVideo);
router.post("/audio", inferenceGuards, upload(50).single("file"), ctrl.analyzeAudio);
router.get("/result/:id", ctrl.getResult);

module.exports = router;
