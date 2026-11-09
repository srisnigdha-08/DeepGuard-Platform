const path = require("path");
const fs = require("fs");
const { verifyAccessToken } = require("../config/jwt");
const User = require("../models/User");
const DetectionResult = require("../models/DetectionResult");

/**
 * Authenticated and authorized access guard for biometric facial heatmap artifacts.
 * Prevents unauthenticated public harvesting and cross-tenant enumeration of user heatmaps.
 * Strictly requires Authorization header (Bearer <token>).
 * Rejects query parameter tokens to prevent JWT leakage in web server access logs and browser history.
 */
async function serveProtectedHeatmap(req, res, next) {
  try {
    const filename = req.params.filename;
    if (!filename || typeof filename !== "string") {
      return res.status(404).json({ success: false, message: "Heatmap not found." });
    }

    // Strictly enforce canonical filename structure: <24-hex-objectId>_heatmap.<ext>
    const match = filename.match(/^([a-fA-F0-9]{24})_heatmap\.(jpg|jpeg|png)$/i);
    if (!match) {
      return res.status(404).json({ success: false, message: "Heatmap not found or invalid format." });
    }
    const recordId = match[1];

    // Extract authentication token strictly from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to access heatmap.",
        code: "NO_TOKEN",
      });
    }
    const token = authHeader.split(" ")[1];

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (e) {
      return res.status(401).json({
        success: false,
        message: e.name === "TokenExpiredError" ? "Token expired." : "Invalid token.",
        code: e.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      });
    }

    // Verify user account status
    const user = await User.findById(decoded.userId).select("role isActive").lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
        code: "USER_NOT_FOUND",
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account suspended.",
        code: "SUSPENDED",
      });
    }

    // Verify record ownership and existence
    const record = await DetectionResult.findById(recordId).select("userId isDeleted").lean();
    if (!record || record.isDeleted) {
      return res.status(404).json({
        success: false,
        message: "Heatmap not found.",
      });
    }

    const isOwner = record.userId.toString() === user._id.toString();
    const isAdmin = user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view this heatmap.",
        code: "FORBIDDEN",
      });
    }

    // Robust directory containment check using path.relative()
    const heatmapsDir = path.resolve(__dirname, "../../uploads/heatmaps");
    const safePath = path.resolve(heatmapsDir, filename);
    const rel = path.relative(heatmapsDir, safePath);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel !== filename) {
      return res.status(400).json({ success: false, message: "Invalid file path." });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ success: false, message: "Heatmap file not found on disk." });
    }

    // Content-Type mapping
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    };
    res.setHeader("Content-Type", mimeTypes[ext] || "image/jpeg");

    // Secure caching headers: sensitive biometric data must never be cached in shared/browser caches
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.sendFile(safePath);
  } catch (err) {
    next(err);
  }
}

module.exports = { serveProtectedHeatmap };
