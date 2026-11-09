/**
 * Jest Global Environment Setup
 *
 * Runs before each test suite:
 * 1. NODE_ENV: If unset, defaults to 'test' (standard Jest convention).
 *    If explicitly set to any other environment (e.g., 'production', 'development'),
 *    it is NOT overridden. It is preserved so testDbGuard will fail closed.
 * 2. TEST_MONGODB_URI: Never supplies a silent fallback. If missing, it remains unset
 *    so getSafeTestURI() fails closed with a clear error.
 * 3. MONGODB_URI: Ambient application connection strings are completely neutralized
 *    so no test or application component can accidentally contact a live/production database.
 */

const path = require("path");

// Load .env if present (e.g. developer's local configuration) without overriding existing env vars
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// 1. NODE_ENV enforcement:
// Only default to 'test' if NODE_ENV is unset/empty.
// If explicitly set to 'production', 'development', etc., preserve it so testDbGuard rejects it.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

// 2. TEST_MONGODB_URI requirement:
// Do NOT provide a silent fallback URI here.
// An explicit TEST_MONGODB_URI must be supplied via environment or .env file.
// If absent, getSafeTestURI() will fail closed upon connection attempt.

// 3. Ambient URI neutralization:
// Neutralize MONGODB_URI so tests never inherit live or production connection strings.
process.env.MONGODB_URI = "";
