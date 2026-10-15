const mongoose = require("mongoose");

const systemMetricsSchema = new mongoose.Schema({
  date:             { type: String, required: true, unique: true }, // "YYYY-MM-DD"
  totalAnalyses:    { type: Number, default: 0 },
  imageAnalyses:    { type: Number, default: 0 },
  videoAnalyses:    { type: Number, default: 0 },
  audioAnalyses:    { type: Number, default: 0 },
  fakeDetected:     { type: Number, default: 0 },
  realDetected:     { type: Number, default: 0 },
  failedAnalyses:   { type: Number, default: 0 },
  activeUsers:      { type: Number, default: 0 },
  newRegistrations: { type: Number, default: 0 },
  rateLimitHits:    { type: Number, default: 0 },
}, { timestamps: true });

systemMetricsSchema.statics.increment = async function (field, amount = 1) {
  const today = new Date().toISOString().split("T")[0];
  await this.findOneAndUpdate(
    { date: today },
    { $inc: { [field]: amount } },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model("SystemMetrics", systemMetricsSchema);
