const path = require("path");
const fs = require("fs");
const aiService = require("../services/aiService");
const storageService = require("../services/storageService");
const DetectionResult = require("../models/DetectionResult");
const User = require("../models/User");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  validateFileType,
} = require("../middleware/fileValidator");
const {
  registerActiveTempFile,
  unregisterActiveTempFile,
} = require("../utils/tempCleaner");
const logger = require("../utils/logger");

const ALLOWED = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/avi", "video/quicktime", "video/x-msvideo"],
  audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"],
};

const cleanupFile = (filePath) => {
  if (filePath) {
    unregisterActiveTempFile(filePath);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.warn(`Failed to cleanup temp file ${filePath}: ${err.message}`);
      }
    }
  }
};

const runAnalysis = async (req, res, mediaType) => {
  const start = Date.now();
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: `No ${mediaType} file in request.` });

  // Deep file validation (extension + MIME + magic bytes)
  const { valid, errors } = await validateFileType(
    req.file,
    ALLOWED[mediaType],
  );
  if (!valid) {
    cleanupFile(req.file.path);
    return res
      .status(415)
      .json({ success: false, message: "File validation failed.", errors });
  }

  // Fail fast if AI service is down — no point saving a pending record
  const health = await aiService.checkHealth();
  if (health.status !== "healthy") {
    cleanupFile(req.file.path);
    return res.status(503).json({
      success: false,
      message: "AI service is currently unavailable. Please try again.",
    });
  }

  // Sanitize original filename against directory traversal sequences
  const rawOriginal = path.basename(req.file.originalname || `upload_${Date.now()}`);
  const safeOriginalFilename = rawOriginal.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);

  // Create pending record for audit trail (even if analysis fails)
  const record = await DetectionResult.create({
    userId: req.user.id,
    mediaType,
    originalFilename: safeOriginalFilename,
    fileSizeBytes: req.file.size,
    mimeType: req.file.mimetype,
    status: "processing",
    verdict: "UNCERTAIN",
    confidence: 0,
    confidencePercent: 0,
  });

  // Ensure file is marked active during inference so temp cleaners never delete it
  registerActiveTempFile(req.file.path);

  const abortController = new AbortController();
  // Node.js HTTP Lifecycle Correctness:
  // Do NOT listen to req.on('close') here — in modern Node.js, IncomingMessage emits 'close'
  // normally once the upload stream has completed, even though the client is still connected
  // waiting for the HTTP response!
  // Instead, listen to res.on('close') and check whether the response has finished or ended.
  const onResponseClose = () => {
    if (!res.writableEnded && !res.writableFinished) {
      logger.warn(`Client connection closed prematurely during ${mediaType} detection for ${record._id}. Propagating cancellation to AI service.`);
      abortController.abort();
    }
  };
  res.on("close", onResponseClose);

  let aiResult;
  try {
    const analyzers = {
      image: (sig) => aiService.analyzeImage(req.file.path, sig),
      video: (sig) => aiService.analyzeVideo(req.file.path, sig),
      audio: (sig) => aiService.analyzeAudio(req.file.path, sig),
    };
    aiResult = await analyzers[mediaType](abortController.signal);
  } catch (err) {
    cleanupFile(req.file.path);

    if (abortController.signal.aborted || err.name === "CanceledError" || err.code === "ERR_CANCELED") {
      logger.info(`AI analysis aborted for ${record._id} due to client disconnect`);
      await DetectionResult.findByIdAndUpdate(record._id, {
        status: "failed",
        errorMessage: "Client disconnected before analysis completed",
      });
      return;
    }

    await DetectionResult.findByIdAndUpdate(record._id, {
      status: "failed",
      errorMessage: err.message,
    });
    logger.error(`AI analysis failed for ${record._id}: ${err.message}`);

    if (err.code === "ECONNABORTED" || err.message?.toLowerCase().includes("timeout")) {
      return res.status(504).json({
        success: false,
        message: "AI analysis timed out. The file may be too complex or the engine is busy.",
        analysisId: record._id,
      });
    }

    if (err.response?.status === 429) {
      res.setHeader("Retry-After", "5");
      return res.status(429).json({
        success: false,
        message: err.response.data?.detail || "AI engine is currently at maximum capacity. Please retry shortly.",
        retryAfter: "5 seconds",
        analysisId: record._id,
      });
    }

    if (err.response?.status === 422) {
      return res.status(422).json({
        success: false,
        message: err.response.data?.detail || "Media processing failed due to invalid or unprocessable content.",
        analysisId: record._id,
      });
    }

    return res.status(502).json({
      success: false,
      message: "AI analysis failed.",
      analysisId: record._id,
    });
  } finally {
    res.off("close", onResponseClose);
    if (req.file?.path) {
      unregisterActiveTempFile(req.file.path);
    }
  }

  // Check for no-face detection
  if (aiResult.face_detected === false || aiResult.status === "no_face_detected") {
    const update = {
      status: "completed",
      verdict: "UNCERTAIN",
      confidence: 0,
      confidencePercent: 0,
      rawFakeProbability: 0,
      manipulationProbability: 0,
      isFake: false,
      faceDetected: false,
      errorMessage: aiResult.error || "No detectable face was found in this image.",
      modelVersion: aiResult.model_version || "efficientnet-b4-epoch34",
      processingTimings: aiResult.timings,
    };
    const final = await DetectionResult.findByIdAndUpdate(record._id, update, {
      new: true,
    }).lean();

    cleanupFile(req.file.path);
    logger.info(`Analysis ${record._id}: UNCERTAIN (No face detected)`);

    return res.json({
      success: true,
      message: "Unable to analyze: No detectable face was found in this image.",
      data: final,
    });
  }

  // Persist heatmap from base64 to disk
  let heatmapUrl = null;
  if (aiResult.heatmap_base64 || aiResult.gradcam_frames?.[0]?.heatmap_base64) {
    const b64 =
      aiResult.heatmap_base64 || aiResult.gradcam_frames[0].heatmap_base64;
    const fname = `${record._id}_heatmap.jpg`;
    const hDir = path.join(__dirname, "../../uploads/heatmaps");
    await storageService.saveBase64Image(b64, path.join(hDir, fname));
    heatmapUrl = `/uploads/heatmaps/${fname}`;
  }

  // Build update from AI response
  const rawFake = typeof aiResult.raw_fake_probability === "number"
    ? aiResult.raw_fake_probability
    : aiResult.confidence;
  const isFake = Boolean(aiResult.is_fake);
  const dispConfPct = typeof aiResult.confidence_percent === "number"
    ? aiResult.confidence_percent
    : (isFake ? rawFake * 100 : (1 - rawFake) * 100);

  const update = {
    status: "completed",
    verdict: isFake ? "FAKE" : "REAL",
    confidence: rawFake, // preserve raw model probability P(Fake)
    confidencePercent: dispConfPct, // displayed confidence: P(Fake) for FAKE, 1 - P(Fake) for REAL
    rawFakeProbability: rawFake,
    manipulationProbability: rawFake,
    isFake,
    modelVersion: aiResult.model_version,
    processingTimings: aiResult.timings,
    heatmapUrl,
  };
  if (mediaType === "image") {
    Object.assign(update, {
      suspiciousRegions: aiResult.suspicious_regions || [],
      regionCount: aiResult.region_count || 0,
      faceDetected: true,
      heatmapBase64: aiResult.heatmap_base64,
      faceCropBase64: aiResult.face_crop_base64,
    });
  }
  if (mediaType === "video") {
    const frameTimeline = (aiResult.frame_timeline || []).map(f => ({
      frameNumber: f.frame_number ?? f.frameNumber,
      timestamp: f.timestamp_sec ?? f.timestamp,
      score: f.score,
      isFake: f.is_fake ?? f.isFake,
    }));

    const gradcamFrames = (aiResult.gradcam_frames || []).map(f => ({
      frameNumber: f.frame_number ?? f.frameNumber,
      timestampSec: f.timestamp_sec ?? f.timestampSec,
      fakeScore: f.fake_score ?? f.fakeScore,
      heatmapBase64: f.heatmap_base64 ?? f.heatmapBase64,
      suspiciousRegions: f.suspicious_regions ?? f.suspiciousRegions ?? [],
    }));

    Object.assign(update, {
      videoInfo: aiResult.video_info,
      frameTimeline,
      framesAnalyzed: aiResult.aggregation?.total_frames_analyzed,
      peakScore: aiResult.aggregation?.peak_score,
      peakTimestampSec: aiResult.aggregation?.peak_timestamp_sec,
      gradcamFrames,
    });
  }
  if (mediaType === "audio") {
    Object.assign(update, {
      audioInfo: aiResult.audio_info,
      segmentScores: aiResult.segment_scores || [],
      suspiciousSegments: aiResult.suspicious_segments || [],
    });
  }

  const final = await DetectionResult.findByIdAndUpdate(record._id, update, {
    new: true,
  }).lean();

  // Update user stats atomically
  const statsField = `stats.total${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)}s`;
  await User.findByIdAndUpdate(req.user.id, {
    $inc: {
      "stats.totalAnalyses": 1,
      [statsField]: 1,
      ...(aiResult.is_fake && { "stats.fakesDetected": 1 }),
    },
    $set: { "stats.lastAnalysisAt": new Date() },
  });

  cleanupFile(req.file.path); // Clean up temp file
  logger.info(
    `Analysis ${record._id}: ${aiResult.verdict} (${Date.now() - start}ms)`,
  );

  res.json({
    success: true,
    message: `${mediaType} analysis complete`,
    data: final,
  });
};

const analyzeImage = asyncHandler((req, res) => runAnalysis(req, res, "image"));
const analyzeVideo = asyncHandler((req, res) => runAnalysis(req, res, "video"));
const analyzeAudio = asyncHandler(async (req, res) => {
  if (req.file) cleanupFile(req.file.path);
  return res.status(503).json({
    success: false,
    message: "Audio deepfake detection is currently unavailable (model training in progress).",
  });
});

const getResult = asyncHandler(async (req, res) => {
  const r = await DetectionResult.findOne({
    _id: req.params.id,
    userId: req.user.id,
    isDeleted: false,
  }).lean();
  if (!r)
    return res
      .status(404)
      .json({ success: false, message: "Result not found." });
  res.json({ success: true, data: r });
});

module.exports = { analyzeImage, analyzeVideo, analyzeAudio, getResult };
