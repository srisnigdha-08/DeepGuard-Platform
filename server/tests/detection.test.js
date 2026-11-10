const request = require("supertest");
const path = require("path");
const fs = require("fs");
const app = require("../src/app");
const aiService = require("../src/services/aiService");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");

describe("Detection API & File Validation", () => {
  let authToken;
  const tempDir = path.join(__dirname, "temp");

  beforeAll(async () => {
    await connectTestDB();
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  });

  beforeEach(async () => {
    await clearTestDB();
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Detector Tester",
      email: "detector@deepguard.local",
      password: "Password123!",
    });
    authToken = regRes.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectTestDB();
    try {
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch (_) {}
  });

  it("rejects unauthorized detection request (no token)", async () => {
    const res = await request(app).post("/api/detect/image");
    expect(res.status).toBe(401);
  });

  it("rejects spoofed file with wrong magic bytes (text file renamed to .jpg)", async () => {
    const spoofedJpg = path.join(tempDir, "spoofed.jpg");
    fs.writeFileSync(spoofedJpg, "This is pure plaintext and not a real JPEG image file!");

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", spoofedJpg);

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/validation failed/i);
  });

  it("rejects file with blocked extension (e.g. .exe)", async () => {
    const exeFile = path.join(tempDir, "malicious.exe");
    fs.writeFileSync(exeFile, "MZ...fake exe content");

    try {
      const res = await request(app)
        .post("/api/detect/image")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", exeFile);

      expect([415, 500]).toContain(res.status); // Multer extension filter rejects with 415 or 500
    } catch (err) {
      expect(err.message).toMatch(/ECONNRESET|aborted/i);
    }
  });

  it("returns 503 Service Unavailable when AI service is down", async () => {
    // Valid 1x1 JPEG bytes
    const validJpg = path.join(tempDir, "valid.jpg");
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x03, 0x02, 0x02, 0x03, 0x02, 0x02, 0x03, 0xff, 0xd9
    ]);
    fs.writeFileSync(validJpg, jpegBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "unavailable" });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", validJpg);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/AI service is currently unavailable/i);
  });

  it("processes a valid image with mocked AI service and stores result", async () => {
    const validJpg = path.join(tempDir, "valid_mock.jpg");
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9
    ]);
    fs.writeFileSync(validJpg, jpegBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockResolvedValueOnce({
      status: "success",
      verdict: "REAL",
      confidence: 0.05,
      confidence_percent: 95.0,
      raw_fake_probability: 0.05,
      is_fake: false,
      face_detected: true,
      suspicious_regions: [],
      region_count: 0,
      timings: { total_ms: 120 },
      model_version: "efficientnet-b4-epoch34",
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", validJpg);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe("REAL");
    expect(res.body.data.confidencePercent).toBe(95.0);
    expect(res.body.data.rawFakeProbability).toBe(0.05);
    expect(res.body.data.faceDetected).toBe(true);
    // Backwards-compatible safety metadata assertions
    expect(res.body.data.safetyMetadata).toBeDefined();
    expect(res.body.data.safetyMetadata.modelId).toBe("efficientnet-b4-epoch34");
    expect(res.body.data.safetyMetadata.decisionThreshold).toBe(0.50);
    expect(res.body.data.safetyMetadata.humanVerificationRecommended).toBe(true);
    expect(res.body.data.safetyMetadata.limitationWarning).toMatch(/FaceForensics\+\+ C23|validation specificity/i);
  });

  it("handles no-face detection from AI service cleanly", async () => {
    const validJpg = path.join(tempDir, "noface.jpg");
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9
    ]);
    fs.writeFileSync(validJpg, jpegBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockResolvedValueOnce({
      status: "no_face_detected",
      verdict: "UNCERTAIN",
      confidence: 0.0,
      confidence_percent: 0.0,
      raw_fake_probability: 0.0,
      is_fake: false,
      face_detected: false,
      error: "No detectable face was found in this image.",
      timings: { total_ms: 60 },
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", validJpg);

    expect(res.status).toBe(200);
    expect(res.body.data.verdict).toBe("UNCERTAIN");
    expect(res.body.data.faceDetected).toBe(false);
    expect(res.body.message).toMatch(/No detectable face/i);
    expect(res.body.data.safetyMetadata).toBeDefined();
    expect(res.body.data.safetyMetadata.scoreInterpretation).toMatch(/no human face/i);
  });

  it("GET /api/detect/result/:id provides backwards-compatible safetyMetadata for historical records", async () => {
    const historicalDoc = await require("../src/models/DetectionResult").create({
      userId: (await require("../src/models/User").findOne({ email: "detector@deepguard.local" }))._id,
      mediaType: "video",
      originalFilename: "historical_video.mp4",
      verdict: "FAKE",
      confidence: 0.92,
      confidencePercent: 92.0,
      rawFakeProbability: 0.92,
      isFake: true,
      faceDetected: true,
      status: "completed",
    });

    const res = await request(app)
      .get(`/api/detect/result/${historicalDoc._id}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe("FAKE");
    expect(res.body.data.confidencePercent).toBe(92.0);
    expect(res.body.data.safetyMetadata).toBeDefined();
    expect(res.body.data.safetyMetadata.isHistoricalRecord).toBe(true);
    expect(res.body.data.safetyMetadata.modelId).toBe(historicalDoc.modelVersion || "unknown-historical-model");
    expect(res.body.data.safetyMetadata.humanVerificationRecommended).toBe(true);

    // Verify non-destructive handling: database document was NOT mutated with safetyMetadata
    const dbDoc = await require("../src/models/DetectionResult").findById(historicalDoc._id);
    expect(dbDoc.safetyMetadata).toBeUndefined();
  });

  it("handles insufficient face detection from video AI service with accurate diagnostic message", async () => {
    const validMp4 = path.join(tempDir, "short_video.mp4");
    // Minimal valid mp4 header with ftyp
    const mp4Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);
    fs.writeFileSync(validMp4, mp4Bytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeVideo").mockResolvedValueOnce({
      status: "insufficient_data",
      error: "Too few faces detected.",
      video_info: { total_frames: 40, duration_sec: 2.0 },
    });

    const res = await request(app)
      .post("/api/detect/video")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", validMp4);

    expect(res.status).toBe(200);
    expect(res.body.data.verdict).toBe("UNCERTAIN");
    expect(res.body.data.faceDetected).toBe(true); // Faces were detected, but too few for reliable sequence analysis
    expect(res.body.message).toMatch(/Too few faces/i);
    expect(res.body.data.safetyMetadata.scoreInterpretation).toMatch(/minimum 3 valid frames/i);
  });

  it("processes video with FAKE prediction verifying score semantics and video-specific metadata", async () => {
    const validMp4 = path.join(tempDir, "fake_video.mp4");
    const mp4Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
      0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
    ]);
    fs.writeFileSync(validMp4, mp4Bytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeVideo").mockResolvedValueOnce({
      status: "success",
      verdict: "FAKE",
      confidence: 0.88,
      confidence_percent: 88.0,
      raw_fake_probability: 0.88,
      is_fake: true,
      aggregation: {
        total_frames_analyzed: 20,
        peak_score: 0.95,
        peak_timestamp_sec: 4.5,
        weighted_mean_score: 0.83,
        overall_score: 0.88,
      },
      frame_timeline: [
        { frame_number: 1, timestamp_sec: 0.5, score: 0.82, is_fake: true },
        { frame_number: 9, timestamp_sec: 4.5, score: 0.95, is_fake: true },
      ],
      timings: { total_ms: 1200, inference_ms: 950 },
      model_version: "efficientnet-b4-epoch34",
    });

    const res = await request(app)
      .post("/api/detect/video")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", validMp4);

    expect(res.status).toBe(200);
    expect(res.body.data.verdict).toBe("FAKE");
    expect(res.body.data.rawFakeProbability).toBe(0.88);
    expect(res.body.data.confidencePercent).toBe(88.0);
    expect(res.body.data.safetyMetadata.aggregation).toBe("quadratic_peak_a0");
    expect(res.body.data.safetyMetadata.limitationWarning).toMatch(/confirmation test cohort of 50 authentic raw videos/i);
  });

  it("POST /api/detect/audio returns 503 because model is not deployed", async () => {
    const dummyAudio = path.join(tempDir, "test.mp3");
    // ID3 header
    fs.writeFileSync(dummyAudio, Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

    const res = await request(app)
      .post("/api/detect/audio")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", dummyAudio);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Audio deepfake detection is currently unavailable/i);
  });
});
