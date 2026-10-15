const path = require("path");
const fs = require("fs");
const logger = require("../utils/logger");

// Block dangerous executable and script extensions
const BLOCKED_EXT = new Set([
  ".exe",".bat",".sh",".php",".py",".js",".html",".htm",
  ".svg",".xml",".zip",".tar",".dll",".so",".bin",".com",
  ".vbs",".ps1",".cmd",".msi"
]);

const MIME_TO_EXT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "video/avi": [".avi"],
  "video/x-msvideo": [".avi"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/flac": [".flac"],
};

const verifyMagicBytes = (header, mimeType) => {
  if (!header || header.length < 4) return false;

  switch (mimeType) {
    case "image/jpeg":
      return header.length >= 3 && header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;

    case "image/png":
      return header.length >= 8 &&
        header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47 &&
        header[4] === 0x0D && header[5] === 0x0A && header[6] === 0x1A && header[7] === 0x0A;

    case "image/webp":
      return header.length >= 12 &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WEBP";

    case "video/mp4":
      return header.length >= 8 && header.toString("ascii", 4, 8) === "ftyp";

    case "video/quicktime":
      if (header.length >= 8) {
        const brand = header.toString("ascii", 4, 8);
        return brand === "ftyp" || brand === "moov" || brand === "mdat" || brand === "wide" || brand === "free";
      }
      return false;

    case "video/avi":
    case "video/x-msvideo":
      return header.length >= 12 &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "AVI ";

    case "audio/mpeg":
      return (header.length >= 3 && header.toString("ascii", 0, 3) === "ID3") ||
             (header.length >= 2 && header[0] === 0xFF && (header[1] & 0xE0) === 0xE0);

    case "audio/wav":
    case "audio/x-wav":
      return header.length >= 12 &&
        header.toString("ascii", 0, 4) === "RIFF" &&
        header.toString("ascii", 8, 12) === "WAVE";

    case "audio/flac":
      return header.length >= 4 && header.toString("ascii", 0, 4) === "fLaC";

    default:
      return false;
  }
};

const getFileHeader = (file, bytesNeeded = 32) => {
  if (file.buffer && Buffer.isBuffer(file.buffer)) {
    return file.buffer.slice(0, bytesNeeded);
  }
  if (file.path && fs.existsSync(file.path)) {
    try {
      const fd = fs.openSync(file.path, "r");
      const buf = Buffer.alloc(bytesNeeded);
      const bytesRead = fs.readSync(fd, buf, 0, bytesNeeded, 0);
      fs.closeSync(fd);
      return buf.slice(0, bytesRead);
    } catch (err) {
      logger.error(`Failed to read header from ${file.path}: ${err.message}`);
      return null;
    }
  }
  return null;
};

const validateFileType = async (file, allowedMimes) => {
  const errors = [];
  const ext = path.extname(file.originalname || "").toLowerCase();

  // 1. Extension blocklist
  if (!ext || BLOCKED_EXT.has(ext)) {
    errors.push(`Blocked or missing extension: '${ext || "none"}'`);
    return { valid: false, errors };
  }

  // 2. MIME whitelist check
  if (!allowedMimes.includes(file.mimetype)) {
    errors.push(`MIME type '${file.mimetype}' is not allowed for this endpoint.`);
    return { valid: false, errors };
  }

  // 3. Extension matches declared MIME
  const expectedExts = MIME_TO_EXT[file.mimetype];
  if (expectedExts && !expectedExts.includes(ext)) {
    errors.push(`File extension '${ext}' does not match declared MIME type '${file.mimetype}'.`);
    return { valid: false, errors };
  }

  // 4. File size check
  const size = file.size ?? (file.path && fs.existsSync(file.path) ? fs.statSync(file.path).size : 0);
  if (size <= 0) {
    errors.push("Uploaded file is empty (0 bytes).");
    return { valid: false, errors };
  }

  // 5. Magic-bytes validation from disk / buffer
  const header = getFileHeader(file, 32);
  if (!header || !verifyMagicBytes(header, file.mimetype)) {
    logger.warn(`Magic-bytes mismatch for ${file.mimetype} from ${file.originalname}`);
    errors.push("File content does not match declared format (possible spoofing or corrupted file).");
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
};

module.exports = { validateFileType, verifyMagicBytes };
