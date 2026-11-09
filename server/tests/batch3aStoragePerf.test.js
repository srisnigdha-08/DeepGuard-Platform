const request = require("supertest");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/app");
const DetectionResult = require("../src/models/DetectionResult");
const { cleanupStaleProcessingRecords } = require("../src/utils/tempCleaner");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");

describe("Batch 3A — Database, Storage, and Performance Optimization", () => {
  let userAToken, userAId;
  let userBToken, userBId;
  const heatmapsDir = path.resolve(__dirname, "../uploads/heatmaps");

  beforeAll(async () => {
    await connectTestDB();
    if (!fs.existsSync(heatmapsDir)) {
      fs.mkdirSync(heatmapsDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    await clearTestDB();

    // Register User A
    const regA = await request(app).post("/api/auth/register").send({
      name: "User Alpha",
      email: "alpha@deepguard.local",
      password: "Password123!",
    });
    userAToken = regA.body.data.accessToken;
    userAId = regA.body.data.user.id;

    // Register User B
    const regB = await request(app).post("/api/auth/register").send({
      name: "User Beta",
      email: "beta@deepguard.local",
      password: "Password123!",
    });
    userBToken = regB.body.data.accessToken;
    userBId = regB.body.data.user.id;
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  describe("Detection History Query Projections", () => {
    it("excludes heavy base64 and frame fields from history list query", async () => {
      const heavyRecord = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "heavy_image.jpg",
        verdict: "REAL",
        confidence: 0.1,
        confidencePercent: 90.0,
        heatmapBase64: "data:image/jpeg;base64,QUxMVEhFSEVBVE1BUERBVEE=",
        faceCropBase64: "data:image/jpeg;base64,QUxMVEhFRkFDRUNST1BEQVRB",
        frameTimeline: [{ frameNumber: 1, timestamp: 0.5, score: 0.1, isFake: false }],
        gradcamFrames: [{ frameNumber: 1, timestampSec: 0.5, fakeScore: 0.1, heatmapBase64: "data:..." }],
        segmentScores: [{ timestamp: 1.0, score: 0.2 }],
        status: "completed",
      });

      const listRes = await request(app)
        .get("/api/history")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      expect(listRes.body.data.results.length).toBe(1);

      const item = listRes.body.data.results[0];
      expect(item._id.toString()).toBe(heavyRecord._id.toString());
      expect(item.originalFilename).toBe("heavy_image.jpg");
      // Heavy payloads MUST be omitted from list view to protect bandwidth and memory
      expect(item.heatmapBase64).toBeUndefined();
      expect(item.faceCropBase64).toBeUndefined();
      expect(item.frameTimeline).toBeUndefined();
      expect(item.gradcamFrames).toBeUndefined();
      expect(item.segmentScores).toBeUndefined();
    });

    it("preserves full detail view on GET /api/history/:id", async () => {
      const heavyRecord = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "heavy_image.jpg",
        verdict: "REAL",
        confidence: 0.1,
        confidencePercent: 90.0,
        heatmapBase64: "QUxMVEhFSEVBVE1BUERBVEE=",
        faceCropBase64: "QUxMVEhFRkFDRUNST1BEQVRB",
        status: "completed",
      });

      const detailRes = await request(app)
        .get(`/api/history/${heavyRecord._id}`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.success).toBe(true);
      expect(detailRes.body.data.heatmapBase64).toBe("QUxMVEhFSEVBVE1BUERBVEE=");
      expect(detailRes.body.data.faceCropBase64).toBe("QUxMVEhFRkFDRUNST1BEQVRB");
    });
  });

  describe("Pagination & Filter Edge Cases", () => {
    beforeEach(async () => {
      const records = [];
      for (let i = 1; i <= 15; i++) {
        records.push({
          userId: userAId,
          mediaType: i % 2 === 0 ? "video" : "image",
          originalFilename: `scan_${i}.jpg`,
          verdict: i === 15 ? "UNCERTAIN" : (i % 2 === 0 ? "FAKE" : "REAL"),
          confidence: 0.5,
          confidencePercent: 50.0,
          status: "completed",
        });
      }
      await DetectionResult.create(records);
    });

    it("applies default pagination (10 per page, page 1)", async () => {
      const res = await request(app)
        .get("/api/history")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(10);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
      expect(res.body.data.pagination.total).toBe(15);
      expect(res.body.data.pagination.hasNext).toBe(true);
      expect(res.body.data.pagination.hasPrev).toBe(false);
    });

    it("handles page 2 correctly with remaining items", async () => {
      const res = await request(app)
        .get("/api/history?page=2&limit=10")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(5);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.hasNext).toBe(false);
      expect(res.body.data.pagination.hasPrev).toBe(true);
    });

    it("safely handles invalid and negative page/limit parameters", async () => {
      const res = await request(app)
        .get("/api/history?page=-3&limit=abc")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
    });

    it("caps limit to maximum 50", async () => {
      const res = await request(app)
        .get("/api/history?limit=100")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.limit).toBe(50);
    });

    it("filters history by UNCERTAIN verdict properly", async () => {
      const res = await request(app)
        .get("/api/history?verdict=UNCERTAIN")
        .set("Authorization", `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.results.length).toBe(1);
      expect(res.body.data.results[0].verdict).toBe("UNCERTAIN");
    });
  });

  describe("Compound Indexes Definition", () => {
    it("declares necessary compound indexes on DetectionResult schema", () => {
      const indexes = DetectionResult.schema.indexes();
      const indexFields = indexes.map(idx => Object.keys(idx[0]).join(","));

      expect(indexFields).toContain("userId,createdAt");
      expect(indexFields).toContain("userId,isDeleted,createdAt");
      expect(indexFields).toContain("userId,isDeleted,mediaType,createdAt");
      expect(indexFields).toContain("userId,isDeleted,verdict,createdAt");
      expect(indexFields).toContain("userId,isDeleted,status,createdAt");
    });
  });

  describe("Heatmap Access Control & Privacy", () => {
    let testRecordId;
    let testHeatmapPath;

    beforeEach(async () => {
      const record = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "face_scan.jpg",
        verdict: "FAKE",
        confidence: 0.95,
        confidencePercent: 95.0,
        status: "completed",
      });
      testRecordId = record._id.toString();
      testHeatmapPath = path.resolve(heatmapsDir, `${testRecordId}_heatmap.jpg`);
      fs.writeFileSync(testHeatmapPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]));
    });

    afterEach(() => {
      try {
        if (testHeatmapPath && fs.existsSync(testHeatmapPath)) {
          fs.unlinkSync(testHeatmapPath);
        }
      } catch (_) {}
    });

    it("rejects unauthenticated request to /uploads/heatmaps/:filename with 401 NO_TOKEN", async () => {
      const res = await request(app).get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN");
    });

    it("strictly rejects JWT in URL query parameters (?token=) with 401 NO_TOKEN", async () => {
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg?token=${userAToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN");
    });

    it("rejects invalid token with 401 TOKEN_INVALID", async () => {
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`)
        .set("Authorization", "Bearer invalid-jwt-token");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("TOKEN_INVALID");
    });

    it("rejects expired token with 401 TOKEN_EXPIRED", async () => {
      const expiredToken = jwt.sign(
        { userId: userAId, role: "user" },
        process.env.JWT_ACCESS_SECRET || "default_jwt_secret",
        { expiresIn: "-10s" }
      );
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`)
        .set("Authorization", `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("TOKEN_EXPIRED");
    });

    it("rejects cross-user access (User B accessing User A's heatmap) with 403 FORBIDDEN", async () => {
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`)
        .set("Authorization", `Bearer ${userBToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FORBIDDEN");
    });

    it("allows owner (User A) to access heatmap via Bearer header with sensitive no-store headers", async () => {
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`)
        .set("Authorization", `Bearer ${userAToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
      expect(res.headers["cache-control"]).toMatch(/no-store/i);
    });

    it("returns 404 for soft-deleted record heatmap", async () => {
      await DetectionResult.findByIdAndUpdate(testRecordId, { isDeleted: true });
      const res = await request(app)
        .get(`/uploads/heatmaps/${testRecordId}_heatmap.jpg`)
        .set("Authorization", `Bearer ${userAToken}`);
      expect(res.status).toBe(404);
    });

    it("rejects path traversal and invalid filename patterns with 400 or 404", async () => {
      const res = await request(app)
        .get("/uploads/heatmaps/../../package.json")
        .set("Authorization", `Bearer ${userAToken}`);
      expect([400, 404]).toContain(res.status);
    });

    it("returns 404 when file does not exist on disk", async () => {
      const missingRecord = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "missing.jpg",
        verdict: "REAL",
        confidence: 0.1,
        status: "completed",
      });
      const res = await request(app)
        .get(`/uploads/heatmaps/${missingRecord._id}_heatmap.jpg`)
        .set("Authorization", `Bearer ${userAToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Record Soft-Delete & Storage Consistency", () => {
    it("deletes heatmap file from disk and wipes heavy base64 upon deletion", async () => {
      const record = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "deletable.jpg",
        verdict: "REAL",
        confidence: 0.1,
        confidencePercent: 90.0,
        heatmapBase64: "QUxMVEhFSEVBVE1BUA==",
        faceCropBase64: "QUxMVEhFRkFDRUNST1A=",
        status: "completed",
      });
      const recordId = record._id.toString();
      const testHeatmap = path.resolve(heatmapsDir, `${recordId}_heatmap.jpg`);
      fs.writeFileSync(testHeatmap, "heatmap-image-bytes");
      expect(fs.existsSync(testHeatmap)).toBe(true);

      const delRes = await request(app)
        .delete(`/api/history/${recordId}`)
        .set("Authorization", `Bearer ${userAToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify file is removed from disk
      expect(fs.existsSync(testHeatmap)).toBe(false);

      // Verify MongoDB document state
      const updatedDoc = await DetectionResult.findById(recordId).lean();
      expect(updatedDoc.isDeleted).toBe(true);
      expect(updatedDoc.heatmapBase64).toBeNull();
      expect(updatedDoc.faceCropBase64).toBeNull();

      // Repeated delete returns 404 cleanly (safe & idempotent)
      const repeatDelRes = await request(app)
        .delete(`/api/history/${recordId}`)
        .set("Authorization", `Bearer ${userAToken}`);
      expect(repeatDelRes.status).toBe(404);
    });
  });

  describe("Stale Processing Records Recovery", () => {
    it("cleans up detection records stuck in processing state for over 1 hour", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const staleRecord = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "stale.jpg",
        verdict: "UNCERTAIN",
        confidence: 0,
        status: "processing",
        createdAt: twoHoursAgo,
      });

      const freshRecord = await DetectionResult.create({
        userId: userAId,
        mediaType: "image",
        originalFilename: "fresh.jpg",
        verdict: "UNCERTAIN",
        confidence: 0,
        status: "processing",
        createdAt: new Date(),
      });

      const cleanupRes = await cleanupStaleProcessingRecords(60 * 60 * 1000);
      expect(cleanupRes.modifiedCount).toBe(1);

      const staleAfter = await DetectionResult.findById(staleRecord._id).lean();
      expect(staleAfter.status).toBe("failed");
      expect(staleAfter.errorMessage).toMatch(/Analysis abandoned/i);

      // Fresh in-flight record MUST NOT be touched
      const freshAfter = await DetectionResult.findById(freshRecord._id).lean();
      expect(freshAfter.status).toBe("processing");
    });
  });
});
