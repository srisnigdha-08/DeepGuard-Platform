const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const { authenticate }  = require("../middleware/auth");
const { asyncHandler }  = require("../utils/asyncHandler");
const DetectionResult   = require("../models/DetectionResult");
const { generateDetectionReport } = require("../services/pdfService");

router.use(authenticate);

// GET /api/reports/analytics — dashboard statistics
// WHY MongoDB aggregation pipeline over application-level aggregation?
// Aggregation pipelines run inside MongoDB — no data transfer to Node.js.
// For 1M records: MongoDB aggregation ~50ms vs Node.js loop ~8000ms.
router.get("/analytics", asyncHandler(async (req, res) => {
  const uid = new mongoose.Types.ObjectId(req.user.id);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [overall, weeklyTrend, mediaBreakdown] = await Promise.all([

    // Stage 1: Overall stats — single group over all completed results
    DetectionResult.aggregate([
      { $match: { userId: uid, isDeleted: false, status: "completed" } },
      { $group: {
        _id: null,
        total:           { $sum: 1 },
        fakeCount:       { $sum: { $cond: ["$isFake", 1, 0] } },
        realCount:       { $sum: { $cond: ["$isFake", 0, 1] } },
        avgConfidence:   { $avg: "$confidence" },
        avgProcessingMs: { $avg: "$processingTimings.totalMs" },
      }},
    ]),

    // Stage 2: Daily trend (last 7 days) — for the trend chart
    DetectionResult.aggregate([
      { $match: { userId: uid, isDeleted: false, status: "completed", createdAt: { $gte: sevenDaysAgo } } },
      { $group: {
        _id:       { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count:     { $sum: 1 },
        fakeCount: { $sum: { $cond: ["$isFake", 1, 0] } },
      }},
      { $sort: { _id: 1 } },
      { $project: { date: "$_id", count: 1, fakeCount: 1, _id: 0 } },
    ]),

    // Stage 3: By media type — for the pie chart
    DetectionResult.aggregate([
      { $match: { userId: uid, isDeleted: false } },
      { $group: { _id: "$mediaType", count: { $sum: 1 } } },
      { $project: { mediaType: "$_id", count: 1, _id: 0 } },
    ]),
  ]);

  const o = overall[0] || {};
  res.json({
    success: true,
    data: {
      overall: {
        total:           o.total || 0,
        fakeCount:       o.fakeCount || 0,
        realCount:       o.realCount || 0,
        avgConfidence:   o.avgConfidence ? parseFloat((o.avgConfidence * 100).toFixed(2)) : 0,
        avgConfidencePercent: o.avgConfidence ? parseFloat((o.avgConfidence * 100).toFixed(1)) : 0,
        avgProcessingMs: Math.round(o.avgProcessingMs || 0),
      },
      weeklyTrend,
      mediaBreakdown,
    },
  });
}));

// PDF report generation handler
// WHY support both GET /:id/pdf and POST /generate/:id?
// GET /:id/pdf matches the REST API specification in README.md and allows direct browser navigation.
// POST /generate/:id supports legacy and explicit trigger calls from UI components.
const handleGenerateReport = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ success: false, message: "Invalid result ID." });

  const result = await DetectionResult.findOne({
    _id: req.params.id, userId: req.user.id,
    isDeleted: false, status: "completed",
  }).lean();

  if (!result)
    return res.status(404).json({ success: false, message: "Analysis result not found." });

  const pdfBuffer = await generateDetectionReport(result);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition",
    `attachment; filename="deepguard-report-${result._id}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// GET /api/reports/:id/pdf — download PDF report (per README API spec)
router.get("/:id/pdf", handleGenerateReport);

// GET /api/reports/generate/:id — alternative GET endpoint
router.get("/generate/:id", handleGenerateReport);

// POST /api/reports/generate/:id — generate PDF report (legacy/action trigger)
router.post("/generate/:id", handleGenerateReport);

module.exports = router;
