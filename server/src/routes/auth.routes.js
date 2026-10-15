const express = require("express");
const router  = express.Router();
const auth    = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth");

// Public routes — no JWT required
router.post("/register", auth.register);
router.post("/login",    auth.login);
router.post("/refresh",  auth.refreshToken);

// Protected routes — JWT required
router.post("/logout", authenticate, auth.logout);
router.get("/me",      authenticate, auth.getMe);

module.exports = router;
