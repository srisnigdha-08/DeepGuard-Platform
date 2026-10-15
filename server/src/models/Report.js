const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  resultId:  { type: mongoose.Schema.Types.ObjectId, ref: "DetectionResult", required: true },
  reportType:{ type: String, enum: ["full","summary","forensic"], default: "full" },
  filename:  { type: String, required: true },
  fileSizeBytes: Number,
  downloadCount: { type: Number, default: 0 },
  lastDownloadAt: Date,
  // Snapshot of result data at time of report generation
  // (prevents dangling reference if result is later deleted)
  snapshot: {
    verdict: String, confidence: Number,
    mediaType: String, originalFilename: String,
  },
}, { timestamps: true });

reportSchema.index({ userId: 1, resultId: 1, reportType: 1 }, { unique: true });

module.exports = mongoose.model("Report", reportSchema);
