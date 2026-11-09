const express    = require("express");
const router     = express.Router();
const mongoose   = require("mongoose");
const fs         = require("fs");
const path       = require("path");
const { authenticate }  = require("../middleware/auth");
const { asyncHandler }  = require("../utils/asyncHandler");
const DetectionResult   = require("../models/DetectionResult");

router.use(authenticate);

// GET /api/history — paginated, filterable history
// WHY server-side pagination? The DetectionResults collection can have millions
// of rows across all users. Returning everything would OOM the client browser.
// Compound index (userId, isDeleted, createdAt) makes each page query sub-2ms.
router.get("/", asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 10,
    mediaType, verdict, search,
    sortBy = "createdAt", sortOrder = "desc",
  } = req.query;

  const filter = { userId: req.user.id, isDeleted: false };
  if (mediaType && ["image","video","audio"].includes(mediaType))
    filter.mediaType = mediaType;
  if (verdict && ["REAL","FAKE","UNCERTAIN"].includes(verdict))
    filter.verdict = verdict;
  if (search?.trim())
    filter.originalFilename = { $regex: search.trim(), $options: "i" };

  const validSort = ["createdAt","confidence"].includes(sortBy) ? sortBy : "createdAt";
  const sort = { [validSort]: sortOrder === "asc" ? 1 : -1 };
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
  const skip = (pageNum - 1) * limitNum;

  // WHY Promise.all? Run count and find in parallel — halves response time.
  const [results, total] = await Promise.all([
    DetectionResult.find(filter).sort(sort).skip(skip).limit(limitNum)
      // Exclude heavy base64 and frame fields from list view — full data only on detail view
      .select("-frameTimeline -gradcamFrames -segmentScores -heatmapBase64 -faceCropBase64").lean(),
    DetectionResult.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      results,
      pagination: {
        total, page: pageNum, limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNext: skip + results.length < total,
        hasPrev: pageNum > 1,
      },
    },
  });
}));

// GET /api/history/:id — single result with all fields
router.get("/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ success: false, message: "Invalid result ID." });
  const r = await DetectionResult.findOne({
    _id: req.params.id, userId: req.user.id, isDeleted: false,
  }).lean();
  if (!r) return res.status(404).json({ success: false, message: "Result not found." });
  res.json({ success: true, data: r });
}));

// DELETE /api/history/:id — soft delete (keeps audit trail and purges storage)
router.delete("/:id", asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ success: false, message: "Invalid result ID." });

  const r = await DetectionResult.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id, isDeleted: false },
    {
      isDeleted: true,
      deletedAt: new Date(),
      heatmapBase64: null,
      faceCropBase64: null,
      gradcamFrames: [],
      frameTimeline: [],
      segmentScores: [],
    },
    { new: true }
  );
  if (!r) return res.status(404).json({ success: false, message: "Result not found." });

  // Clean up associated heatmap file from disk to prevent storage leaks
  const heatmapPath = path.resolve(__dirname, "../../uploads/heatmaps", `${req.params.id}_heatmap.jpg`);
  try {
    if (fs.existsSync(heatmapPath)) {
      fs.unlinkSync(heatmapPath);
    }
  } catch (_) {}

  res.json({ success: true, message: "Result deleted." });
}));

module.exports = router;
