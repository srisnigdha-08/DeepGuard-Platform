const crypto = require("crypto");
const { body, validationResult } = require("express-validator");
const User     = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../config/jwt");
const { asyncHandler } = require("../utils/asyncHandler");

const hashToken = t => crypto.createHash("sha256").update(t).digest("hex");

const setCookie = (res, token) =>
  res.cookie("refreshToken", token, {
    httpOnly: true,             // JS cannot read it — XSS-proof
    secure:   process.env.NODE_ENV === "production", // HTTPS-only in prod
    sameSite: "strict",         // CSRF protection
    maxAge:   7 * 24 * 60 * 60 * 1000,
    path:     "/api/auth",      // Scoped — only sent to auth endpoints
  });

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return true;
  }
  return false;
};

// ── Register ──────────────────────────────────────────────────
const register = [
  body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be 2–50 characters"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
  body("password")
    .isLength({ min: 8 }).withMessage("Min 8 characters")
    .matches(/[A-Z]/).withMessage("One uppercase required")
    .matches(/[a-z]/).withMessage("One lowercase required")
    .matches(/[0-9]/).withMessage("One number required")
    .matches(/[!@#$%^&*]/).withMessage("One special character required"),
  asyncHandler(async (req, res) => {
    if (validate(req, res)) return;
    const { name, email, password } = req.body;
    if (await User.findOne({ email }))
      return res.status(409).json({ success: false, message: "Email already registered." });
    const user = await User.create({ name, email, password });
    const payload = { userId: user._id, role: user.role };
    const at = generateAccessToken(payload);
    const rt = generateRefreshToken(payload);
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: {
        $each: [{ token: hashToken(rt), expiresAt: new Date(Date.now() + 7*24*60*60*1000), userAgent: req.headers["user-agent"], ip: req.ip }],
        $slice: -5,
      }},
    });
    await AuditLog.log("USER_REGISTERED", { userId: user._id, ip: req.ip, severity: "info" });
    setCookie(res, rt);
    res.status(201).json({ success: true, data: { user: user.publicProfile, accessToken: at } });
  }),
];

// ── Login ──────────────────────────────────────────────────────
const login = [
  body("email").isEmail().normalizeEmail(),
  body("password").notEmpty(),
  asyncHandler(async (req, res) => {
    if (validate(req, res)) return;
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (user?.isLocked())
      return res.status(429).json({ success: false, message: "Account locked. Try again in 30 minutes.", code: "ACCOUNT_LOCKED" });

    const valid = user ? await user.comparePassword(password) : false;
    if (!user || !valid) {
      if (user) {
        user.loginAttempts += 1;
        if (user.loginAttempts >= 5) user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        await user.save({ validateBeforeSave: false });
      }
      return res.status(401).json({ success: false, message: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
    }

    // Reset lockout on successful login
    if (user.loginAttempts > 0) {
      user.loginAttempts = 0;
      user.lockUntil = undefined;
      await user.save({ validateBeforeSave: false });
    }

    const payload = { userId: user._id, role: user.role };
    const at = generateAccessToken(payload);
    const rt = generateRefreshToken(payload);

    // Clean expired tokens, then add new one (cap at 5)
    await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } } });
    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: {
        $each: [{ token: hashToken(rt), expiresAt: new Date(Date.now() + 7*24*60*60*1000), userAgent: req.headers["user-agent"], ip: req.ip }],
        $slice: -5,
      }},
    });

    await AuditLog.log("USER_LOGIN", { userId: user._id, ip: req.ip, severity: "info" });
    setCookie(res, rt);
    res.json({ success: true, data: { user: user.publicProfile, accessToken: at } });
  }),
];

// ── Refresh Token ─────────────────────────────────────────────
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ success: false, message: "No refresh token.", code: "NO_REFRESH_TOKEN" });

  let decoded;
  try { decoded = verifyRefreshToken(token); }
  catch { return res.status(401).json({ success: false, message: "Invalid refresh token.", code: "REFRESH_INVALID" }); }

  const hashed = hashToken(token);
  const user = await User.findOne({
    _id: decoded.userId,
    "refreshTokens.token": hashed,
    "refreshTokens.expiresAt": { $gt: new Date() },
  });

  if (!user) {
    // Token not found but signature valid = REUSE ATTACK
    // Invalidate ALL sessions for this user
    await User.findByIdAndUpdate(decoded.userId, { $set: { refreshTokens: [] } });
    await AuditLog.log("TOKEN_REUSE_DETECTED", { userId: decoded.userId, severity: "critical" });
    return res.status(401).json({ success: false, message: "Token reuse detected. All sessions revoked.", code: "TOKEN_REUSE" });
  }

  const payload = { userId: user._id, role: user.role };
  const newAt = generateAccessToken(payload);
  const newRt = generateRefreshToken(payload);

  // Rotate: remove old, add new
  await User.findByIdAndUpdate(user._id, { $pull: { refreshTokens: { token: hashed } } });
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: {
      $each: [{ token: hashToken(newRt), expiresAt: new Date(Date.now() + 7*24*60*60*1000), userAgent: req.headers["user-agent"], ip: req.ip }],
      $slice: -5,
    }},
  });

  setCookie(res, newRt);
  res.json({ success: true, data: { accessToken: newAt } });
});

// ── Logout ────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (token) await User.findByIdAndUpdate(req.user.id, { $pull: { refreshTokens: { token: hashToken(token) } } });
  res.clearCookie("refreshToken", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/auth" });
  res.json({ success: true, message: "Logged out successfully." });
});

// ── Get Me ────────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  res.json({ success: true, data: { user } });
});

module.exports = { register, login, refreshToken, logout, getMe };
