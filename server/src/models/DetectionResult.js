const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
  {
    x: Number,
    y: Number,
    width: Number,
    height: Number,
    intensity: Number,
    suspicionLevel: { type: String, enum: ["low", "medium", "high"] },
  },
  { _id: false },
);

const frameSchema = new mongoose.Schema(
  {
    frameNumber: Number,
    timestamp: Number,
    score: Number,
    isFake: Boolean,
  },
  { _id: false },
);

// WHY document DB (MongoDB) over relational for detection results?
// Image, video, and audio results have DIFFERENT structures:
// - Image: suspiciousRegions[], faceDetected
// - Video: frameTimeline[], gradcamFrames[], videoInfo{}
// - Audio: segmentScores[], audioInfo{}
// A relational approach needs 9 tables + complex joins.
// Document model maps naturally to variable result schemas.
const detectionResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    mediaType: {
      type: String,
      enum: ["image", "video", "audio"],
      required: true,
    },
    originalFilename: { type: String, required: true },
    fileSizeBytes: Number,
    mimeType: String,
    verdict: {
      type: String,
      enum: ["REAL", "FAKE", "UNCERTAIN"],
      required: true,
    },
    confidence: { type: Number, min: 0, max: 1, required: true },
    confidencePercent: Number,
    rawFakeProbability: Number,
    manipulationProbability: Number,
    isFake: { type: Boolean, default: false },
    modelVersion: { type: String, default: "efficientnet-b4-v1.0" },
    heatmapUrl: String,
    heatmapBase64: String,
    faceCropBase64: String,
    // Image-specific
    suspiciousRegions: [regionSchema],
    regionCount: { type: Number, default: 0 },
    faceDetected: Boolean,
    // Video-specific
    videoInfo: mongoose.Schema.Types.Mixed,
    frameTimeline: [frameSchema],
    framesAnalyzed: Number,
    peakScore: Number,
    peakTimestampSec: Number,
    gradcamFrames: [
      {
        frameNumber: Number,
        timestampSec: Number,
        fakeScore: Number,
        heatmapBase64: String,
        suspiciousRegions: [regionSchema],
      },
    ],
    // Audio-specific
    audioInfo: mongoose.Schema.Types.Mixed,
    segmentScores: [{ timestamp: Number, score: Number }],
    suspiciousSegments: [
      { startSec: Number, endSec: Number, cloneScore: Number },
    ],
    // Shared
    processingTimings: mongoose.Schema.Types.Mixed,
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "completed",
    },
    errorMessage: String,
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
  },
  { timestamps: true },
);

// WHY compound indexes?
// userId+createdAt: history page (user's results sorted by date) — <2ms
// userId+mediaType+createdAt: filtered history — <2ms
// userId+verdict: analytics aggregation — <2ms
// Without these, every history query is a full collection scan — O(n).
detectionResultSchema.index({ userId: 1, createdAt: -1 });
detectionResultSchema.index({ userId: 1, mediaType: 1, createdAt: -1 });
detectionResultSchema.index({ userId: 1, verdict: 1 });
detectionResultSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 });
detectionResultSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("DetectionResult", detectionResultSchema);
