const multer = require("multer");
const path   = require("path");
const crypto = require("crypto");
const uuidv4 = () => crypto.randomUUID();

// WHY disk storage over memory storage?
// Video files can be 500 MB. Buffering them in Node.js heap would exhaust RAM.
// Disk storage streams directly to /uploads/temp — only a file descriptor in RAM.
// Memory storage is only acceptable for files < 5 MB (e.g., avatar uploads).
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) =>
    cb(null, path.join(__dirname, "../../uploads/temp")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Whitelist of allowed extensions (secondary check after MIME type)
const ALLOWED_EXT = /\.(jpe?g|png|webp|mp4|avi|mov|mp3|wav|flac)$/i;

const fileFilter = (req, file, cb) =>
  ALLOWED_EXT.test(path.extname(file.originalname || ""))
    ? cb(null, true)
    : cb(new Error(`Extension ${path.extname(file.originalname)} is not allowed`), false);

/**
 * Create a multer instance with a file-size limit.
 * @param {number} maxMB  Maximum file size in megabytes
 */
const createUpload = maxMB =>
  multer({
    storage:    diskStorage,
    fileFilter,
    limits:     { fileSize: maxMB * 1024 * 1024 },
  });

module.exports = { createUpload };
