const jwt = require("jsonwebtoken");

// WHY two tokens?
// Access token (15 min): short-lived, sent in every request header.
// Refresh token (7 days): long-lived, stored in HTTP-only cookie.
// If access token is stolen (XSS), attacker window is just 15 minutes.
// If refresh token is stolen, rotation+reuse-detection revokes it immediately.
const BASE_OPTS = { issuer: "deepguard", audience: "deepguard-users" };

const generateAccessToken  = payload => jwt.sign(payload, process.env.JWT_ACCESS_SECRET,  { ...BASE_OPTS, expiresIn: "15m" });
const generateRefreshToken = payload => jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { ...BASE_OPTS, expiresIn: "7d"  });
const verifyAccessToken    = token   => jwt.verify(token, process.env.JWT_ACCESS_SECRET,  BASE_OPTS);
const verifyRefreshToken   = token   => jwt.verify(token, process.env.JWT_REFRESH_SECRET, BASE_OPTS);

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken };
