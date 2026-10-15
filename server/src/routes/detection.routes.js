const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/detection.controller");

const router = express.Router();

// WHY disk storage over memory storage?
// Video files can be 500MB. Loading them into Node.js memory would OOM the server.
// Disk storage streams directly to /uploads/temp — only a file descriptor in RAM.
const storage = multer.diskStorage({
  destination: (_, __, cb) =>
    cb(null, path.join(__dirname, "../../uploads/temp")),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Whitelist of permitted extensions as a secondary check
const allowedExt = /\.(jpe?g|png|webp|mp4|avi|mov|mp3|wav|flac)$/i;
const fileFilter = (_, file, cb) =>
  allowedExt.test(path.extname(file.originalname || ""))
    ? cb(null, true)
    : cb(new Error("File extension not allowed"), false);

const upload = (maxMB) =>
  multer({ storage, fileFilter, limits: { fileSize: maxMB * 1024 * 1024 } });

// All detection routes require authentication
router.use(authenticate);

// WHY different max sizes? 20MB is ample for any single JPEG/PNG.
// 500MB supports up to ~2-min 1080p video at 35 Mbps.
// 50MB covers 30s of uncompressed 48kHz audio.
router.post("/image", upload(20).single("file"), ctrl.analyzeImage);
router.post("/video", upload(500).single("file"), ctrl.analyzeVideo);
router.post("/audio", upload(50).single("file"), ctrl.analyzeAudio);
router.get("/result/:id", ctrl.getResult);

module.exports = router;
