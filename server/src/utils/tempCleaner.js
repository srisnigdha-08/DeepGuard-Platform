const fs = require("fs");
const path = require("path");
const logger = require("./logger");

let periodicInterval = null;

// In-memory registry of temporary files currently in use by active uploads or in-flight inferences.
// Guaranteed exclusion from both startup and periodic orphan sweeping.
const activeTempFiles = new Set();

function registerActiveTempFile(filePath) {
  if (filePath && typeof filePath === "string") {
    activeTempFiles.add(path.resolve(filePath));
  }
}

function unregisterActiveTempFile(filePath) {
  if (filePath && typeof filePath === "string") {
    activeTempFiles.delete(path.resolve(filePath));
  }
}

function isTempFileActive(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  return activeTempFiles.has(path.resolve(filePath));
}

function getActiveTempFilesCount() {
  return activeTempFiles.size;
}

function clearActiveTempFiles() {
  activeTempFiles.clear();
}

/**
 * Removes temporary files that were abandoned due to dropped client connections,
 * crashes, or unhandled failures.
 *
 * Safety properties:
 * - Active file registry check: Never deletes files currently being uploaded or inferred
 * - Uses lstatSync to avoid following symlinks to arbitrary system paths
 * - Strictly verifies canonical directory boundary
 * - Safe against concurrent unlink races
 * - Non-destructive to files within threshold (default: 15 min)
 *
 * @param {string} tempDir - Directory path to clean
 * @param {number} maxAgeMs - Maximum age in ms before an unregistered file is considered orphaned (default: 15 min)
 */
function cleanOrphanedTempFiles(
  tempDir = path.join(__dirname, "../../uploads/temp"),
  maxAgeMs = 15 * 60 * 1000
) {
  try {
    const resolvedDir = path.resolve(tempDir);
    if (!fs.existsSync(resolvedDir)) {
      fs.mkdirSync(resolvedDir, { recursive: true });
      return { cleaned: 0, errors: 0 };
    }

    const now = Date.now();
    const files = fs.readdirSync(resolvedDir);
    let cleaned = 0;
    let errors = 0;

    for (const file of files) {
      if (file === ".gitkeep") continue;
      const filePath = path.resolve(resolvedDir, file);

      // Security check: ensure path does not escape the intended temporary directory
      if (!filePath.startsWith(resolvedDir)) {
        logger.warn(`Suspicious path traversal attempt detected in temp dir: ${file}`);
        continue;
      }

      // Active file protection: Never delete a file currently registered in an active upload or inference
      if (isTempFileActive(filePath)) {
        continue;
      }

      try {
        // Use lstatSync to avoid following symbolic links to arbitrary system targets
        const stat = fs.lstatSync(filePath);

        if (stat.isSymbolicLink()) {
          // Unlink the symlink itself without following
          fs.unlinkSync(filePath);
          cleaned++;
          continue;
        }

        if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (err) {
        // Race condition safe: if another worker unlinked the file, ignore ENOENT
        if (err.code !== "ENOENT") {
          errors++;
          logger.warn(`Failed to remove orphaned temp file ${file}: ${err.message}`);
        }
      }
    }

    if (cleaned > 0) {
      logger.info(`Orphaned temp cleaner removed ${cleaned} file(s) from ${resolvedDir}`);
    }

    return { cleaned, errors };
  } catch (err) {
    logger.error(`Temp cleaner error: ${err.message}`);
    return { cleaned: 0, errors: 1 };
  }
}

/**
 * Starts periodic cleaning of orphaned temp files.
 * Uses .unref() so the background timer never prevents Node.js process exit or Jest tests from completing.
 */
function startPeriodicTempCleaner(
  intervalMs = 30 * 60 * 1000,
  maxAgeMs = 15 * 60 * 1000,
  tempDir = path.join(__dirname, "../../uploads/temp")
) {
  if (periodicInterval) {
    clearInterval(periodicInterval);
  }
  // Run an immediate sweep on initialization
  cleanOrphanedTempFiles(tempDir, maxAgeMs);

  periodicInterval = setInterval(() => {
    cleanOrphanedTempFiles(tempDir, maxAgeMs);
  }, intervalMs);

  // Unref ensures the timer does not keep Node.js or test processes alive
  if (periodicInterval && typeof periodicInterval.unref === "function") {
    periodicInterval.unref();
  }
  return periodicInterval;
}

function stopPeriodicTempCleaner() {
  if (periodicInterval) {
    clearInterval(periodicInterval);
    periodicInterval = null;
  }
}

module.exports = {
  cleanOrphanedTempFiles,
  startPeriodicTempCleaner,
  stopPeriodicTempCleaner,
  registerActiveTempFile,
  unregisterActiveTempFile,
  isTempFileActive,
  getActiveTempFilesCount,
  clearActiveTempFiles,
};
