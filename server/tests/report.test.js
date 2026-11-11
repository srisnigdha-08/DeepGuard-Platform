const request = require("supertest");
const app = require("../src/app");
const DetectionResult = require("../src/models/DetectionResult");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");

describe("Report & PDF Download API", () => {
  let userTokenA;
  let userIdA;
  let userTokenB;
  let userIdB;

  let imageResultId;
  let videoResultId;
  let noFaceResultId;
  let pendingResultId;
  let deletedResultId;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    // Create User A once
    const regResA = await request(app).post("/api/auth/register").send({
      name: "User Alpha",
      email: "alpha@deepguard.local",
      password: "Password123!",
    });
    userTokenA = regResA.body.data.accessToken;
    userIdA = regResA.body.data.user.id;

    // Create User B (for multi-tenant isolation verification) once
    const regResB = await request(app).post("/api/auth/register").send({
      name: "User Beta",
      email: "beta@deepguard.local",
      password: "Password123!",
    });
    userTokenB = regResB.body.data.accessToken;
    userIdB = regResB.body.data.user.id;
  });

  beforeEach(async () => {
    await DetectionResult.deleteMany({});

    // Seed test results for User A
    const imageDoc = await DetectionResult.create({
      userId: userIdA,
      mediaType: "image",
      originalFilename: "face_sample.jpg",
      verdict: "REAL",
      confidence: 0.12,
      confidencePercent: 88.0,
      rawFakeProbability: 0.12,
      isFake: false,
      faceDetected: true,
      status: "completed",
      modelVersion: "v1.0.0-efficientnet-b4",
      processingTimings: { totalMs: 120, inferenceMs: 45 },
    });
    imageResultId = imageDoc._id.toString();

    const videoDoc = await DetectionResult.create({
      userId: userIdA,
      mediaType: "video",
      originalFilename: "deepfake_video.mp4",
      verdict: "FAKE",
      confidence: 0.94,
      confidencePercent: 94.0,
      rawFakeProbability: 0.94,
      isFake: true,
      faceDetected: true,
      status: "completed",
      modelVersion: "v1.0.0-efficientnet-b4",
      processingTimings: { totalMs: 850, inferenceMs: 620 },
    });
    videoResultId = videoDoc._id.toString();

    const noFaceDoc = await DetectionResult.create({
      userId: userIdA,
      mediaType: "image",
      originalFilename: "landscape_no_face.jpg",
      verdict: "UNCERTAIN",
      confidence: 0.5,
      confidencePercent: 50.0,
      rawFakeProbability: 0.5,
      isFake: false,
      faceDetected: false,
      errorMessage: "No human face found in media",
      status: "completed",
      modelVersion: "v1.0.0-efficientnet-b4",
      processingTimings: { totalMs: 80, inferenceMs: 30 },
    });
    noFaceResultId = noFaceDoc._id.toString();

    const pendingDoc = await DetectionResult.create({
      userId: userIdA,
      mediaType: "video",
      originalFilename: "processing.mp4",
      verdict: "UNCERTAIN",
      confidence: 0.5,
      confidencePercent: 50.0,
      isFake: false,
      status: "pending",
    });
    pendingResultId = pendingDoc._id.toString();

    const deletedDoc = await DetectionResult.create({
      userId: userIdA,
      mediaType: "image",
      originalFilename: "deleted.jpg",
      verdict: "REAL",
      confidence: 0.05,
      confidencePercent: 95.0,
      isFake: false,
      faceDetected: true,
      status: "completed",
      isDeleted: true,
    });
    deletedResultId = deletedDoc._id.toString();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  describe("GET /api/reports/:id/pdf", () => {
    it("successfully downloads PDF for completed image analysis", async () => {
      const res = await request(app)
        .get(`/api/reports/${imageResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenA}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from("");
          response.on("data", chunk => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on("end", () => callback(null, response.data));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.headers["content-disposition"]).toContain(`deepguard-report-${imageResultId}.pdf`);
      expect(res.body).toBeInstanceOf(Buffer);
      expect(res.body.length).toBeGreaterThan(1000);
      expect(res.body.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    });

    it("successfully downloads PDF for completed video analysis", async () => {
      const res = await request(app)
        .get(`/api/reports/${videoResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenA}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from("");
          response.on("data", chunk => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on("end", () => callback(null, response.data));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    });

    it("successfully downloads PDF for UNCERTAIN / no-face detection", async () => {
      const res = await request(app)
        .get(`/api/reports/${noFaceResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenA}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from("");
          response.on("data", chunk => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on("end", () => callback(null, response.data));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    });

    it("rejects unauthenticated request with 401", async () => {
      const res = await request(app).get(`/api/reports/${imageResultId}/pdf`);
      expect(res.status).toBe(401);
    });

    it("enforces tenant ownership isolation (returns 404 for other user's report)", async () => {
      const res = await request(app)
        .get(`/api/reports/${imageResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it("returns 400 for malformed objectId", async () => {
      const res = await request(app)
        .get("/api/reports/invalid-id-format/pdf")
        .set("Authorization", `Bearer ${userTokenA}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid result id/i);
    });

    it("returns 404 for soft-deleted result", async () => {
      const res = await request(app)
        .get(`/api/reports/${deletedResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenA}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for uncompleted / pending result", async () => {
      const res = await request(app)
        .get(`/api/reports/${pendingResultId}/pdf`)
        .set("Authorization", `Bearer ${userTokenA}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/reports/generate/:id", () => {
    it("successfully generates PDF via POST", async () => {
      const res = await request(app)
        .post(`/api/reports/generate/${imageResultId}`)
        .set("Authorization", `Bearer ${userTokenA}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from("");
          response.on("data", chunk => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on("end", () => callback(null, response.data));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    });
  });

  describe("GET /api/reports/generate/:id", () => {
    it("successfully generates PDF via alternative GET endpoint", async () => {
      const res = await request(app)
        .get(`/api/reports/generate/${imageResultId}`)
        .set("Authorization", `Bearer ${userTokenA}`)
        .buffer(true)
        .parse((response, callback) => {
          response.data = Buffer.from("");
          response.on("data", chunk => {
            response.data = Buffer.concat([response.data, chunk]);
          });
          response.on("end", () => callback(null, response.data));
        });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toBe("application/pdf");
      expect(res.body.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    });
  });
});
