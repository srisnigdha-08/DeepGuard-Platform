const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// WHY embed refreshTokens in User document?
// Avoids a separate collection join on every refresh.
// We cap at 5 tokens (slice) so the array never grows unbounded.
// Each token is hashed (SHA-256) — plain tokens never touch the DB.
const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true,
              match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.[a-z]{2,})+$/i, "Invalid email"] },
  password: { type: String, required: true, minlength: 8, select: false },
  role:     { type: String, enum: ["user", "admin"], default: "user" },
  isActive: { type: Boolean, default: true },

  refreshTokens: [{
    token:     String,
    expiresAt: Date,
    userAgent: String,
    ip:        String,
    createdAt: { type: Date, default: Date.now },
  }],

  stats: {
    totalAnalyses: { type: Number, default: 0 },
    totalImages:   { type: Number, default: 0 },
    totalVideos:   { type: Number, default: 0 },
    totalAudios:   { type: Number, default: 0 },
    fakesDetected: { type: Number, default: 0 },
    lastAnalysisAt: Date,
  },

  loginAttempts: { type: Number, default: 0 },
  lockUntil:     Date,
}, { timestamps: true, toJSON: { virtuals: true } });

// Compound indexes — most common query patterns
userSchema.index({ role: 1, isActive: 1 });

// Auto-hash password on save (never store plaintext)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12); // cost 12 = ~300ms on modern CPU
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

userSchema.virtual("publicProfile").get(function () {
  return {
    id: this._id, name: this.name, email: this.email,
    role: this.role, stats: this.stats, createdAt: this.createdAt,
  };
});

module.exports = mongoose.model("User", userSchema);
