const express  = require("express");
const router   = express.Router();
const { authenticate } = require("../middleware/auth");
const adminGuard       = require("../middleware/adminGuard");
const { asyncHandler } = require("../utils/asyncHandler");
const User             = require("../models/User");
const DetectionResult  = require("../models/DetectionResult");
const AuditLog         = require("../models/AuditLog");

// All admin routes require: valid JWT + admin role
// WHY two separate middlewares? authenticate sets req.user;
// adminGuard checks req.user.role. Separation allows reuse of adminGuard
// in other contexts (e.g., socket connections) without re-implementing auth.
router.use(authenticate, adminGuard);

// GET /api/admin/users — all users (admin only)
router.get("/users", asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const filter = {};
  if (search?.trim()) filter.$or = [
    { name: { $regex: search.trim(), $options: "i" } },
    { email: { $regex: search.trim(), $options: "i" } },
  ];
  const [users, total] = await Promise.all([
    User.find(filter).select("-password -refreshTokens")
      .sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit)).lean(),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: { users, total, page: parseInt(page) } });
}));

// PATCH /api/admin/users/:id — toggle active status
router.patch("/users/:id/toggle", asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  if (user._id.toString() === req.user.id)
    return res.status(400).json({ success: false, message: "Cannot suspend your own account." });
  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });
  await AuditLog.log("ADMIN_USER_TOGGLE", {
    userId: req.user.id, severity: "warning",
    metadata: { targetId: user._id, newStatus: user.isActive },
  });
  res.json({ success: true, data: { userId: user._id, isActive: user.isActive } });
}));

// GET /api/admin/metrics — platform-wide metrics
router.get("/metrics", asyncHandler(async (req, res) => {
  const [total, fakes, users, recentErrors] = await Promise.all([
    DetectionResult.countDocuments({ status: "completed" }),
    DetectionResult.countDocuments({ isFake: true }),
    User.countDocuments({ isActive: true }),
    DetectionResult.countDocuments({ status: "failed", createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } }),
  ]);
  res.json({
    success: true,
    data: { totalAnalyses: total, fakesDetected: fakes, activeUsers: users, errorsLast24h: recentErrors },
  });
}));

// GET /api/admin/audit — recent audit log
router.get("/audit", asyncHandler(async (req, res) => {
  const { severity, limit = 50 } = req.query;
  const filter = {};
  if (severity) filter.severity = severity;
  const logs = await AuditLog.find(filter)
    .sort({ createdAt: -1 }).limit(parseInt(limit))
    .populate("userId", "name email").lean();
  res.json({ success: true, data: logs });
}));

module.exports = router;
