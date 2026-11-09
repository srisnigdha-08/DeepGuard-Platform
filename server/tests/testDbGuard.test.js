const {
  validateTestDatabaseURI,
  validateTestDatabaseName,
  sanitizeURI,
  parseMongoDBUri,
  getSafeTestURI,
  assertSafeConnection,
} = require("./testDbGuard");
const { clearTestDB } = require("./setup");
const User = require("../src/models/User");
const DetectionResult = require("../src/models/DetectionResult");

describe("Test Database Safety Guard — Regression & Isolation Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ── 1. Protocol & Remote Atlas Rejection ─────────────────────────
  describe("Protocol and Remote Host Protection", () => {
    it("rejects MongoDB Atlas mongodb+srv:// connection strings", () => {
      const atlasUri = "mongodb+srv://admin_user:SuperSecretPassword123@cluster0.dabq8nm.mongodb.net/deepguard_test";
      expect(() => validateTestDatabaseURI(atlasUri, "test")).toThrow(
        /mongodb\+srv.*protocol.*Atlas.*not permitted/i
      );
    });

    it("sanitizes user credentials when rejecting an Atlas URI", () => {
      const atlasUriWithSecret = "mongodb+srv://admin_user:SuperSecretPassword123@cluster0.dabq8nm.mongodb.net/deepguard_test";
      try {
        validateTestDatabaseURI(atlasUriWithSecret, "test");
        throw new Error("Should have thrown error");
      } catch (err) {
        expect(err.message).not.toContain("SuperSecretPassword123");
        expect(sanitizeURI(atlasUriWithSecret)).toContain("***:***");
        expect(sanitizeURI(atlasUriWithSecret)).not.toContain("SuperSecretPassword123");
      }
    });

    it("rejects remote non-loopback IP addresses", () => {
      const remoteIpUri = "mongodb://192.168.1.100:27017/deepguard_test";
      expect(() => validateTestDatabaseURI(remoteIpUri, "test")).toThrow(
        /Rejected non-loopback MongoDB host: '192\.168\.1\.100'/i
      );
    });

    it("rejects remote non-loopback domain hostnames", () => {
      const remoteDomainUri = "mongodb://db.staging.deepguard.internal:27017/deepguard_test";
      expect(() => validateTestDatabaseURI(remoteDomainUri, "test")).toThrow(
        /Rejected non-loopback MongoDB host: 'db\.staging\.deepguard\.internal'/i
      );
    });

    it("rejects public cloud database IPs (e.g. AWS / GCP / DigitalOcean)", () => {
      const publicIpUri = "mongodb://54.210.12.34:27017/deepguard_test";
      expect(() => validateTestDatabaseURI(publicIpUri, "test")).toThrow(
        /Rejected non-loopback MongoDB host: '54\.210\.12\.34'/i
      );
    });
  });

  // ── 2. Database Name Validation ─────────────────────────────────
  describe("Database Name Safety Guard", () => {
    it("rejects production application database 'deepguard'", () => {
      const prodUri = "mongodb://127.0.0.1:27017/deepguard";
      expect(() => validateTestDatabaseURI(prodUri, "test")).toThrow(
        /Forbidden database name for testing: 'deepguard'/i
      );
    });

    it("rejects default example database 'deepfake_db'", () => {
      const exampleUri = "mongodb://127.0.0.1:27017/deepfake_db";
      expect(() => validateTestDatabaseURI(exampleUri, "test")).toThrow(
        /Forbidden database name for testing: 'deepfake_db'/i
      );
    });

    it("rejects system databases (admin, config, local, system)", () => {
      for (const sysDb of ["admin", "config", "local", "system"]) {
        const uri = `mongodb://127.0.0.1:27017/${sysDb}`;
        expect(() => validateTestDatabaseURI(uri, "test")).toThrow(
          new RegExp(`Forbidden database name for testing: '${sysDb}'`, "i")
        );
      }
    });

    it("rejects generic non-test database names (production, dev, staging)", () => {
      for (const genericDb of ["production", "dev", "development", "staging"]) {
        const uri = `mongodb://127.0.0.1:27017/${genericDb}`;
        expect(() => validateTestDatabaseURI(uri, "test")).toThrow(
          new RegExp(`Forbidden database name for testing: '${genericDb}'`, "i")
        );
      }
    });

    it("rejects missing or empty database names in connection string", () => {
      expect(() => validateTestDatabaseURI("mongodb://127.0.0.1:27017", "test")).toThrow(
        /Missing database name in test URI/i
      );
      expect(() => validateTestDatabaseURI("mongodb://127.0.0.1:27017/", "test")).toThrow(
        /Missing database name in test URI/i
      );
      expect(() => validateTestDatabaseURI("mongodb://127.0.0.1:27017/?authSource=admin", "test")).toThrow(
        /Missing database name in test URI/i
      );
    });

    it("rejects database names lacking an explicit test designator", () => {
      expect(() => validateTestDatabaseURI("mongodb://127.0.0.1:27017/myanalytics", "test")).toThrow(
        /Invalid test database name: 'myanalytics'/i
      );
      expect(() => validateTestDatabaseURI("mongodb://127.0.0.1:27017/userstore", "test")).toThrow(
        /Invalid test database name: 'userstore'/i
      );
    });
  });

  // ── 3. Configuration & Fallback Rejection ───────────────────────
  describe("Test Configuration & Fallback Protection", () => {
    it("rejects missing TEST_MONGODB_URI when not set in environment", () => {
      delete process.env.TEST_MONGODB_URI;
      expect(() => getSafeTestURI()).toThrow(
        /TEST_MONGODB_URI is not set.*never fall back to MONGODB_URI/i
      );
    });

    it("never falls back to MONGODB_URI even when MONGODB_URI is set", () => {
      delete process.env.TEST_MONGODB_URI;
      process.env.MONGODB_URI = "mongodb+srv://admin:pass@cluster0.mongodb.net/deepguard";

      expect(() => getSafeTestURI()).toThrow(
        /TEST_MONGODB_URI is not set.*never fall back to MONGODB_URI/i
      );
    });

    it("rejects empty or whitespace-only TEST_MONGODB_URI", () => {
      process.env.TEST_MONGODB_URI = "   ";
      expect(() => getSafeTestURI()).toThrow(
        /TEST_MONGODB_URI is not set.*never fall back to MONGODB_URI/i
      );
    });

    it("returns trimmed URI when TEST_MONGODB_URI is validly configured", () => {
      process.env.TEST_MONGODB_URI = "  mongodb://127.0.0.1:27017/deepguard_test  ";
      expect(getSafeTestURI()).toBe("mongodb://127.0.0.1:27017/deepguard_test");
    });

    it("fails closed when connectTestDB is invoked without TEST_MONGODB_URI", async () => {
      const { connectTestDB } = require("./setup");
      delete process.env.TEST_MONGODB_URI;
      await expect(connectTestDB()).rejects.toThrow(
        /TEST_MONGODB_URI is not set.*never fall back to MONGODB_URI/i
      );
    });

    it("ensures ambient MONGODB_URI is completely neutralized during testing", () => {
      // In tests, MONGODB_URI must not hold live Atlas or production connection strings
      expect(process.env.MONGODB_URI).not.toMatch(/mongodb(?:\+srv)?:\/\/.*cluster/i);
    });
  });

  // ── 4. NODE_ENV Enforcement ────────────────────────────────────
  describe("NODE_ENV Safety Enforcement", () => {
    const validLocalUri = "mongodb://127.0.0.1:27017/deepguard_test";

    it("rejects execution when NODE_ENV is 'development'", () => {
      expect(() => validateTestDatabaseURI(validLocalUri, "development")).toThrow(
        /NODE_ENV must be set to 'test'/i
      );
    });

    it("rejects execution when NODE_ENV is 'production'", () => {
      expect(() => validateTestDatabaseURI(validLocalUri, "production")).toThrow(
        /NODE_ENV must be set to 'test'/i
      );
    });

    it("rejects execution when NODE_ENV is undefined", () => {
      expect(() => validateTestDatabaseURI(validLocalUri, undefined)).toThrow(
        /NODE_ENV must be set to 'test'/i
      );
    });

    it("fails closed when connectTestDB is executed under explicit NODE_ENV=production", async () => {
      const { connectTestDB } = require("./setup");
      process.env.NODE_ENV = "production";
      await expect(connectTestDB()).rejects.toThrow(
        /NODE_ENV must be set to 'test'/i
      );
    });

    it("fails closed when connectTestDB is executed under explicit NODE_ENV=development", async () => {
      const { connectTestDB } = require("./setup");
      process.env.NODE_ENV = "development";
      await expect(connectTestDB()).rejects.toThrow(
        /NODE_ENV must be set to 'test'/i
      );
    });
  });

  // ── 5. Acceptance of Valid Local Test Databases ─────────────────
  describe("Valid Loopback Test Database Acceptance", () => {
    it("accepts standard IPv4 loopback with deepguard_test", () => {
      const res = validateTestDatabaseURI("mongodb://127.0.0.1:27017/deepguard_test", "test");
      expect(res.hosts).toEqual(["127.0.0.1"]);
      expect(res.dbName).toBe("deepguard_test");
      expect(res.protocol).toBe("mongodb");
    });

    it("accepts localhost hostname with deepfake_test", () => {
      const res = validateTestDatabaseURI("mongodb://localhost:27017/deepfake_test", "test");
      expect(res.hosts).toEqual(["localhost"]);
      expect(res.dbName).toBe("deepfake_test");
    });

    it("accepts IPv6 loopback [::1] with dedicated test db", () => {
      const res = validateTestDatabaseURI("mongodb://[::1]:27017/deepguard_test", "test");
      expect(res.hosts).toEqual(["[::1]"]);
      expect(res.dbName).toBe("deepguard_test");
    });

    it("accepts query parameters on valid loopback connection", () => {
      const res = validateTestDatabaseURI("mongodb://127.0.0.1:27017/deepguard_test?authSource=admin&directConnection=true", "test");
      expect(res.dbName).toBe("deepguard_test");
      expect(res.hosts).toEqual(["127.0.0.1"]);
    });
  });

  // ── 6. Revalidation Before Destructive Operations ───────────────
  describe("Active Connection Revalidation (assertSafeConnection)", () => {
    it("blocks destructive operations if connected to non-loopback host", () => {
      const dangerousConnection = {
        readyState: 1,
        host: "cluster0.dabq8nm.mongodb.net",
        name: "deepguard_test",
      };
      expect(() => assertSafeConnection(dangerousConnection)).toThrow(
        /Destructive test operation blocked: Connected host '.*' is not a recognized loopback host/i
      );
    });

    it("blocks destructive operations if connected to non-test database", () => {
      const dangerousConnection = {
        readyState: 1,
        host: "127.0.0.1",
        name: "deepguard",
      };
      expect(() => assertSafeConnection(dangerousConnection)).toThrow(
        /Forbidden database name for testing: 'deepguard'/i
      );
    });

    it("blocks destructive operations if database connection is closed", () => {
      const closedConnection = {
        readyState: 0,
        host: "127.0.0.1",
        name: "deepguard_test",
      };
      expect(() => assertSafeConnection(closedConnection)).toThrow(
        /Database connection is not open \(readyState !== 1\)/i
      );
    });

    it("blocks destructive operations if NODE_ENV is modified to non-test", () => {
      process.env.NODE_ENV = "production";
      const validConnection = {
        readyState: 1,
        host: "127.0.0.1",
        name: "deepguard_test",
      };
      expect(() => assertSafeConnection(validConnection)).toThrow(
        /NODE_ENV must be 'test'/i
      );
    });

    it("permits cleanup when active connection is confirmed loopback and test db", () => {
      const safeConnection = {
        readyState: 1,
        host: "127.0.0.1",
        name: "deepguard_test",
      };
      expect(() => assertSafeConnection(safeConnection)).not.toThrow();
    });
  });

  // ── 7. Proof that Cleanup Never Executes After Validation Failure ─
  describe("Proof of Blocked Destructive Cleanup", () => {
    it("never calls deleteMany if connection validation fails", async () => {
      const mongoose = require("mongoose");
      const deleteUserSpy = jest.spyOn(User, "deleteMany").mockResolvedValue({});
      const deleteResultSpy = jest.spyOn(DetectionResult, "deleteMany").mockResolvedValue({});

      // Mock an unsafe connection state
      const originalReadyState = mongoose.connection._readyState;
      const originalName = mongoose.connection.name;
      const originalHost = mongoose.connection.host;

      mongoose.connection._readyState = 1;
      mongoose.connection.host = "cluster0.mongodb.net";
      mongoose.connection.name = "deepguard_live";

      await expect(clearTestDB()).rejects.toThrow(/Destructive test operation blocked/i);

      expect(deleteUserSpy).not.toHaveBeenCalled();
      expect(deleteResultSpy).not.toHaveBeenCalled();

      deleteUserSpy.mockRestore();
      deleteResultSpy.mockRestore();
      mongoose.connection._readyState = originalReadyState;
      mongoose.connection.host = originalHost;
      mongoose.connection.name = originalName;
    });
  });
});
