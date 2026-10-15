const mongoose = require("mongoose");

// Append-only security audit trail.
// WHY TTL index? Security logs older than 90 days have diminishing value
// and consume storage. MongoDB auto-deletes documents past the TTL.
const auditLogSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  action:   { type: String, required: true, index: true },
  ip:       String,
  userAgent:String,
  path:     String,
  method:   String,
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  severity: { type: String, enum: ["info","warning","critical"], default: "info" },
  createdAt:{ type: Date, default: Date.now, expires: 90 * 24 * 60 * 60 }, // TTL: 90 days
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditLogSchema.index({ severity: 1, createdAt: -1 });

auditLogSchema.statics.log = async function (action, data = {}) {
  try { await this.create({ action, ...data }); }
  catch (err) { console.error("Audit log failed silently:", err.message); }
};

module.exports = mongoose.model("AuditLog", auditLogSchema);
