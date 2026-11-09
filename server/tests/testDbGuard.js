/**
 * DeepGuard — Test Database Safety Guard
 *
 * Enforces strict fail-closed validation for database operations during testing:
 * 1. Requires NODE_ENV === 'test'.
 * 2. Requires explicit TEST_MONGODB_URI.
 * 3. Never falls back to MONGODB_URI for destructive testing.
 * 4. Rejects remote MongoDB hosts, including Atlas (mongodb+srv://).
 * 5. Allows only recognized loopback database hosts (127.0.0.1, localhost, [::1]).
 * 6. Requires an explicitly identified test database name (e.g., deepguard_test).
 * 7. Revalidates connection identity before any destructive cleanup operation.
 * 8. Sanitizes connection strings to prevent credential exposure in logs or errors.
 */

const ALLOWED_LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
]);

const FORBIDDEN_DB_NAMES = new Set([
  "admin",
  "config",
  "local",
  "system",
  "deepguard",
  "deepfake_db",
  "prod",
  "production",
  "dev",
  "development",
  "staging",
  "stage",
  "main",
  "live",
]);

// Must contain 'test' as a word, suffix, or prefix with delimiter (e.g., deepguard_test, deepfake_test)
const TEST_DB_REGEX = /(?:^|[-_])test(?:$|[-_])/i;

/**
 * Sanitizes a MongoDB URI by redacting username and password credentials.
 * @param {string} rawUri
 * @returns {string}
 */
function sanitizeURI(rawUri) {
  if (typeof rawUri !== "string") return "";
  return rawUri.replace(/(mongodb(?:\+srv)?:\/\/)([^:]+):([^@]+)@/i, "$1***:***@");
}

/**
 * Parses and breaks down a MongoDB URI into protocol, hosts, and database name.
 * @param {string} rawUri
 * @returns {{ protocol: string, hosts: string[], dbName: string }}
 */
function parseMongoDBUri(rawUri) {
  if (typeof rawUri !== "string" || !rawUri.trim()) {
    throw new Error("Missing test database URI: URI must be a non-empty string.");
  }

  const trimmed = rawUri.trim();
  const match = trimmed.match(/^(mongodb(?:\+srv)?):\/\/([^/]+)(?:\/([^?#]*))?(?:\?.*)?$/i);
  if (!match) {
    throw new Error(
      `Malformed MongoDB URI: '${sanitizeURI(trimmed)}'. Expected format: mongodb://host:port/dbname`
    );
  }

  const [, protocol, hostPart, dbPart] = match;
  const rawHosts = hostPart.includes("@") ? hostPart.split("@")[1] : hostPart;

  const hosts = rawHosts.split(",").map((h) => {
    const clean = h.trim();
    if (clean.startsWith("[")) {
      const ipv6Match = clean.match(/^(\[[0-9a-fA-F:]+\])(?::\d+)?$/);
      return ipv6Match ? ipv6Match[1] : clean;
    }
    return clean.split(":")[0];
  });

  const dbName = (dbPart || "").trim();
  return { protocol: protocol.toLowerCase(), hosts, dbName };
}

/**
 * Validates that a database name meets the strict test database criteria.
 * @param {string} dbName
 */
function validateTestDatabaseName(dbName) {
  if (!dbName || typeof dbName !== "string" || !dbName.trim()) {
    throw new Error(
      "Missing database name in test URI: An explicit test database name is required (e.g. 'deepguard_test')."
    );
  }

  const normalized = dbName.trim().toLowerCase();

  if (FORBIDDEN_DB_NAMES.has(normalized)) {
    throw new Error(
      `Forbidden database name for testing: '${dbName}'. Non-test and production database names are strictly rejected.`
    );
  }

  if (!TEST_DB_REGEX.test(normalized)) {
    throw new Error(
      `Invalid test database name: '${dbName}'. The database name must explicitly contain 'test' (e.g. 'deepguard_test' or 'test_db').`
    );
  }
}

/**
 * Validates a MongoDB URI to ensure it is strictly safe for testing.
 * @param {string} rawUri
 * @param {string} [nodeEnv]
 * @returns {{ protocol: string, hosts: string[], dbName: string, sanitizedUri: string }}
 */
function validateTestDatabaseURI(rawUri, explicitEnv) {
  const nodeEnv = arguments.length >= 2 ? explicitEnv : process.env.NODE_ENV;
  if (nodeEnv !== "test") {
    throw new Error(
      `Unsafe test environment: NODE_ENV must be set to 'test' (currently '${nodeEnv || "undefined"}').`
    );
  }

  const { protocol, hosts, dbName } = parseMongoDBUri(rawUri);

  if (protocol === "mongodb+srv") {
    throw new Error(
      "Rejected remote MongoDB host: 'mongodb+srv://' protocol (Atlas DNS SRV) is not permitted for tests."
    );
  }

  if (protocol !== "mongodb") {
    throw new Error(
      `Rejected unsupported protocol: '${protocol}://'. Only standard 'mongodb://' protocol is permitted for tests.`
    );
  }

  if (!hosts || hosts.length === 0) {
    throw new Error("Rejected MongoDB URI: No hosts found in connection string.");
  }

  for (const host of hosts) {
    const normalizedHost = host.toLowerCase();
    if (!ALLOWED_LOOPBACK_HOSTS.has(normalizedHost)) {
      throw new Error(
        `Rejected non-loopback MongoDB host: '${host}'. Only local loopback hosts (127.0.0.1, localhost, [::1]) are permitted for tests.`
      );
    }
  }

  validateTestDatabaseName(dbName);

  return {
    protocol,
    hosts,
    dbName,
    sanitizedUri: sanitizeURI(rawUri),
  };
}

/**
 * Retrieves the explicit TEST_MONGODB_URI from environment, failing closed if absent.
 * Never falls back to MONGODB_URI.
 * @returns {string}
 */
function getSafeTestURI() {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri || typeof uri !== "string" || !uri.trim()) {
    throw new Error(
      "Unsafe test environment: TEST_MONGODB_URI is not set. Refusing to run tests without explicit test database configuration. Tests must never fall back to MONGODB_URI."
    );
  }
  return uri.trim();
}

/**
 * Revalidates that an active Mongoose connection is safe before any destructive operation.
 * @param {import("mongoose").Connection} connection
 */
function assertSafeConnection(connection) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `Destructive test operation blocked: NODE_ENV must be 'test' (currently '${process.env.NODE_ENV || "undefined"}').`
    );
  }

  if (!connection || connection.readyState !== 1) {
    throw new Error(
      "Destructive test operation blocked: Database connection is not open (readyState !== 1)."
    );
  }

  const host = (connection.host || "").toLowerCase();
  const isLoopback =
    ALLOWED_LOOPBACK_HOSTS.has(host) ||
    host === "127.0.0.1" ||
    host === "localhost" ||
    host === "::1";

  if (!isLoopback) {
    throw new Error(
      `Destructive test operation blocked: Connected host '${connection.host}' is not a recognized loopback host.`
    );
  }

  const dbName = connection.name || "";
  validateTestDatabaseName(dbName);
}

module.exports = {
  ALLOWED_LOOPBACK_HOSTS,
  FORBIDDEN_DB_NAMES,
  TEST_DB_REGEX,
  sanitizeURI,
  parseMongoDBUri,
  validateTestDatabaseName,
  validateTestDatabaseURI,
  getSafeTestURI,
  assertSafeConnection,
};
