/**
 * Jest Configuration for DeepGuard Server
 *
 * Configures strict serial execution and global environment pre-flight
 * to guarantee complete test isolation and prevent database crosstalk.
 */

module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["<rootDir>/tests/testEnvSetup.js"],
  maxWorkers: 1, // Enforce serial execution so test suites do not clear concurrent test data
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
};
