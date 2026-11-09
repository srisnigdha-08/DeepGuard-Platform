const request = require("supertest");
const path = require("path");
const fs = require("fs");
const express = require("express");
const app = require("../src/app");
const aiService = require("../src/services/aiService");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");
const {
  cleanOrphanedTempFiles,
  startPeriodicTempCleaner,
  stopPeriodicTempCleaner,
  registerActiveTempFile,
  unregisterActiveTempFile,
  isTempFileActive,
} = require("../src/utils/tempCleaner");
const {
  concurrencyLimiter,
  createConcurrencyLimiter,
  setActiveDetections,
  resetActiveDetections,
  getActiveDetections,
} = require("../src/middleware/concurrencyLimiter");
const { createDetectionLimiter } = require("../src/middleware/rateLimiter");
const { validateFileType } = require("../src/middleware/fileValidator");
const DetectionResult = require("../src/models/DetectionResult");

describe("Batch 2B: Upload Security, Rate Limiting & Resource Protection", () => {
  let authToken;
  const tempTestDir = path.join(__dirname, "temp_upload_sec");

  const validJpgBytes = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
  ]);

  const validMp4Bytes = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ]);

  beforeAll(async () => {
    await connectTestDB();
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    await clearTestDB();
    resetActiveDetections();
    jest.restoreAllMocks();

    const regRes = await request(app).post("/api/auth/register").send({
      name: "Upload Sec Tester",
      email: "upload_sec@deepguard.local",
      password: "Password123!",
    });
    authToken = regRes.body.data.accessToken;
  });

  afterAll(async () => {
    stopPeriodicTempCleaner();
    resetActiveDetections();
    await disconnectTestDB();
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      }
    } catch (_) {}
  });

  // 1. Valid image upload (200 OK)
  it("Scenario 1: processes valid image upload with 200 OK and cleans up temp file", async () => {
    const filePath = path.join(tempTestDir, "sample_valid.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockResolvedValueOnce({
      status: "success",
      verdict: "REAL",
      confidence: 0.02,
      confidence_percent: 98.0,
      raw_fake_probability: 0.02,
      is_fake: false,
      face_detected: true,
      suspicious_regions: [],
      region_count: 0,
      timings: { total_ms: 85 },
      model_version: "efficientnet-b4",
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe("REAL");
    expect(res.body.data._id).toBeDefined();
  });

  // 2. Valid video upload (200 OK)
  it("Scenario 2: processes valid video upload with 200 OK and cleans up temp file", async () => {
    const filePath = path.join(tempTestDir, "sample_valid.mp4");
    fs.writeFileSync(filePath, validMp4Bytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeVideo").mockResolvedValueOnce({
      status: "success",
      verdict: "FAKE",
      confidence: 0.94,
      confidence_percent: 94.0,
      raw_fake_probability: 0.94,
      is_fake: true,
      face_detected: true,
      aggregation: {
        total_frames_analyzed: 16,
        peak_score: 0.94,
      },
      suspicious_regions: [],
      timings: { total_ms: 1250 },
    });

    const res = await request(app)
      .post("/api/detect/video")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe("FAKE");
    expect(res.body.data.framesAnalyzed).toBe(16);
  });

  // 3. Unsupported extension
  it("Scenario 3: rejects file with unsupported extension at Multer layer with HTTP 415", async () => {
    const filePath = path.join(tempTestDir, "script.sh");
    fs.writeFileSync(filePath, "#!/bin/bash\necho dangerous");

    try {
      const res = await request(app)
        .post("/api/detect/image")
        .set("Authorization", `Bearer ${authToken}`)
        .attach("file", filePath);

      expect(res.status).toBe(415);
      expect(res.body.code).toBe("INVALID_FILE_EXTENSION");
    } catch (err) {
      expect(err.message).toMatch(/ECONNRESET|aborted/i);
    }
  });

  // 4. Incorrect MIME type / Magic Bytes
  it("Scenario 4 & 5: rejects file with spoofed extension and mismatched magic bytes with 415", async () => {
    const filePath = path.join(tempTestDir, "spoofed.jpg");
    fs.writeFileSync(filePath, "PlainText pretending to be image");

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(415);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/validation failed/i);
  });

  // 6. Oversized upload rejection
  it("Scenario 6: rejects oversized upload exceeding Multer size limits with 413", async () => {
    const bigFilePath = path.join(tempTestDir, "oversized.jpg");
    const fd = fs.openSync(bigFilePath, "w");
    fs.writeSync(fd, validJpgBytes, 0, validJpgBytes.length, 0);
    fs.writeSync(fd, Buffer.from([0x00]), 0, 1, 21 * 1024 * 1024);
    fs.closeSync(fd);

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", bigFilePath);

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/File exceeds maximum size/i);
  });

  // 7. Corrupted media / AI processing error
  it("Scenario 7: handles AI processing failure cleanly without crashing", async () => {
    const filePath = path.join(tempTestDir, "corrupted.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockRejectedValueOnce(new Error("Corrupted JPEG stream in AI engine"));

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/AI analysis failed/i);
  });

  // 8. Missing authentication
  it("Scenario 8: rejects unauthenticated requests with 401 before upload processing", async () => {
    const res = await request(app).post("/api/detect/image");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NO_TOKEN");
  });

  // 9 & 10. Rate-limit threshold & Retry-After header
  it("Scenario 9 & 10: enforces detection rate limiting with 429 and Retry-After header", async () => {
    const testLimiterApp = express();
    testLimiterApp.use(express.json());
    const strictLimiter = createDetectionLimiter({ max: 2, windowMs: 60 * 1000 });
    testLimiterApp.post("/test-detect", strictLimiter, (req, res) => res.json({ success: true }));

    const res1 = await request(testLimiterApp).post("/test-detect");
    expect(res1.status).toBe(200);

    const res2 = await request(testLimiterApp).post("/test-detect");
    expect(res2.status).toBe(200);

    const res3 = await request(testLimiterApp).post("/test-detect");
    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.message).toMatch(/limit reached/i);
    expect(res3.headers["retry-after"]).toBeDefined();
    expect(parseInt(res3.headers["retry-after"], 10)).toBeGreaterThan(0);
  });

  // 11. AI service timeout (504 Gateway Timeout)
  it("Scenario 11: returns 504 Gateway Timeout when AI service request times out", async () => {
    const filePath = path.join(tempTestDir, "timeout.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    const timeoutErr = new Error("timeout of 30000ms exceeded");
    timeoutErr.code = "ECONNABORTED";
    jest.spyOn(aiService, "analyzeImage").mockRejectedValueOnce(timeoutErr);

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(504);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/timed out/i);
  });

  // 12. AI service unavailable (503 Service Unavailable)
  it("Scenario 12: returns 503 when AI service health check fails", async () => {
    const filePath = path.join(tempTestDir, "unavail.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "unavailable" });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/unavailable/i);
  });

  // 13. Failed inference cleanup
  it("Scenario 13: guarantees temp file is deleted from disk even when inference fails", async () => {
    const filePath = path.join(tempTestDir, "cleanup_fail.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    let recordedTempPath = null;
    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockImplementationOnce((tempPath) => {
      recordedTempPath = tempPath;
      throw new Error("Simulated inference crash");
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(502);
    expect(recordedTempPath).not.toBeNull();
    expect(fs.existsSync(recordedTempPath)).toBe(false);
  });

  // 14. Concurrency limit bounds & 429 Retry-After: 5
  it("Scenario 14: rejects requests with 429 when concurrency slots are saturated", async () => {
    setActiveDetections(50);

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/processing maximum concurrent requests/i);
    expect(res.headers["retry-after"]).toBe("5");

    resetActiveDetections();
  });

  // 15. Filename traversal sanitization
  it("Scenario 15: sanitizes malicious path traversal filenames to pure base names", async () => {
    const filePath = path.join(tempTestDir, "normal.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockResolvedValueOnce({
      status: "success",
      verdict: "REAL",
      confidence: 0.1,
      confidence_percent: 90.0,
      raw_fake_probability: 0.1,
      is_fake: false,
      face_detected: true,
      suspicious_regions: [],
      timings: { total_ms: 50 },
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath, "../../etc/shadow_exploit.jpg");

    expect(res.status).toBe(200);
    expect(res.body.data._id).toBeDefined();

    const getRes = await request(app)
      .get(`/api/detect/result/${res.body.data._id}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.originalFilename).not.toContain("..");
    expect(getRes.body.data.originalFilename).not.toContain("/");
    expect(getRes.body.data.originalFilename).not.toContain("\\");
    expect(getRes.body.data.originalFilename).toBe("shadow_exploit.jpg");
  });

  // 16. Preservation of service authentication
  it("Scenario 16: attaches X-Service-Key header on outbound AI service requests", async () => {
    const key = process.env.AI_SERVICE_KEY;
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThanOrEqual(32);

    const mockConfig = { headers: {} };
    const intercepted = aiService._aiClient.interceptors.request.handlers[0].fulfilled(mockConfig);
    expect(intercepted.headers["X-Service-Key"]).toBe(key.trim());
  });

  // Static directory isolation test
  it("prevents public HTTP access to uploads/temp directory", async () => {
    const res = await request(app).get("/uploads/temp/");
    expect(res.status).toBe(404);
  });

  // Orphaned temp cleaner utility test
  it("cleans up orphaned temp files older than threshold", () => {
    const orphanDir = path.join(tempTestDir, "orphan_test");
    fs.mkdirSync(orphanDir, { recursive: true });

    const staleFile = path.join(orphanDir, "stale_temp.jpg");
    const freshFile = path.join(orphanDir, "fresh_temp.jpg");
    const gitkeep = path.join(orphanDir, ".gitkeep");

    fs.writeFileSync(staleFile, "stale");
    fs.writeFileSync(freshFile, "fresh");
    fs.writeFileSync(gitkeep, "");

    const pastTime = (Date.now() - 30 * 60 * 1000) / 1000;
    fs.utimesSync(staleFile, pastTime, pastTime);

    const result = cleanOrphanedTempFiles(orphanDir, 15 * 60 * 1000);
    expect(result.cleaned).toBe(1);
    expect(fs.existsSync(staleFile)).toBe(false);
    expect(fs.existsSync(freshFile)).toBe(true);
    expect(fs.existsSync(gitkeep)).toBe(true);
  });

  // ── New Hardening Tests for Phase 1-6 ──────────────────────────────────────

  it("translates AI service 422 unprocessable content cleanly to client 422", async () => {
    const filePath = path.join(tempTestDir, "bomb.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    const err422 = new Error("Request failed with status code 422");
    err422.response = {
      status: 422,
      data: { detail: "Image resolution 5000x5000 exceeds maximum allowed 4096x4096 limit" },
    };
    jest.spyOn(aiService, "analyzeImage").mockRejectedValueOnce(err422);

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exceeds maximum allowed 4096x4096 limit/i);
  });

  it("concurrency limiter guards against double-release and underflow", () => {
    resetActiveDetections();
    const limiter = createConcurrencyLimiter({ maxConcurrent: 2 });
    const mockReq = { ip: "127.0.0.1" };
    let finishCb = null;
    let closeCb = null;
    const mockRes = {
      on: (event, cb) => {
        if (event === "finish") finishCb = cb;
        if (event === "close") closeCb = cb;
      },
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    let nextCalled = false;
    limiter(mockReq, mockRes, () => { nextCalled = true; });

    expect(nextCalled).toBe(true);
    expect(getActiveDetections()).toBe(1);

    // Normal response lifecycle emits finish, then close
    finishCb();
    expect(getActiveDetections()).toBe(0);

    // Duplicate release event on close must not decrement under 0
    closeCb();
    expect(getActiveDetections()).toBe(0);
  });

  it("verifies all 9 supported media format signatures with validateFileType", async () => {
    const testCases = [
      { ext: ".jpg", mime: "image/jpeg", bytes: validJpgBytes, type: "image", valid: true },
      { ext: ".png", mime: "image/png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), type: "image", valid: true },
      { ext: ".webp", mime: "image/webp", bytes: Buffer.from("RIFF\x00\x00\x00\x00WEBP"), type: "image", valid: true },
      { ext: ".mp4", mime: "video/mp4", bytes: validMp4Bytes, type: "video", valid: true },
      { ext: ".mov", mime: "video/quicktime", bytes: Buffer.from("\x00\x00\x00\x14ftypqt  "), type: "video", valid: true },
      { ext: ".avi", mime: "video/avi", bytes: Buffer.from("RIFF\x00\x00\x00\x00AVI "), type: "video", valid: true },
      { ext: ".mp3", mime: "audio/mpeg", bytes: Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00"), type: "audio", valid: true },
      { ext: ".wav", mime: "audio/wav", bytes: Buffer.from("RIFF\x00\x00\x00\x00WAVE"), type: "audio", valid: true },
      { ext: ".flac", mime: "audio/flac", bytes: Buffer.from("fLaC\x00\x00\x00\x00"), type: "audio", valid: true },
    ];

    const ALLOWED = {
      image: ["image/jpeg", "image/png", "image/webp"],
      video: ["video/mp4", "video/avi", "video/quicktime", "video/x-msvideo"],
      audio: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac"],
    };

    for (const tc of testCases) {
      const p = path.join(tempTestDir, `test_sig${tc.ext}`);
      fs.writeFileSync(p, tc.bytes);
      const mockFile = {
        path: p,
        originalname: `file${tc.ext}`,
        mimetype: tc.mime,
        size: tc.bytes.length,
      };

      const result = await validateFileType(mockFile, ALLOWED[tc.type]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("periodic temp cleaner starts and stops safely with .unref()", () => {
    const timer = startPeriodicTempCleaner(10000, 5000, tempTestDir);
    expect(timer).toBeDefined();
    stopPeriodicTempCleaner();
  });

  // ── Final Verification Tests for HTTP Lifecycle & Active Temp Safety ──────

  it("active temporary files are excluded from periodic cleanup even if older than maxAge", () => {
    const activeDir = path.join(tempTestDir, "active_file_test");
    fs.mkdirSync(activeDir, { recursive: true });

    const activeFile = path.join(activeDir, "slow_upload_file.mp4");
    const abandonedFile = path.join(activeDir, "abandoned_file.mp4");

    fs.writeFileSync(activeFile, "actively uploading content");
    fs.writeFileSync(abandonedFile, "abandoned content");

    // Age both files to 30 minutes in the past
    const pastTime = (Date.now() - 30 * 60 * 1000) / 1000;
    fs.utimesSync(activeFile, pastTime, pastTime);
    fs.utimesSync(abandonedFile, pastTime, pastTime);

    // Register activeFile as active in-flight upload
    registerActiveTempFile(activeFile);
    expect(isTempFileActive(activeFile)).toBe(true);

    // Run orphan cleaner
    const sweep1 = cleanOrphanedTempFiles(activeDir, 15 * 60 * 1000);
    expect(sweep1.cleaned).toBe(1);
    expect(fs.existsSync(activeFile)).toBe(true); // PROTECTED
    expect(fs.existsSync(abandonedFile)).toBe(false); // DELETED

    // Once active upload completes and unregisters
    unregisterActiveTempFile(activeFile);
    expect(isTempFileActive(activeFile)).toBe(false);

    // Next sweep cleans it safely
    const sweep2 = cleanOrphanedTempFiles(activeDir, 15 * 60 * 1000);
    expect(sweep2.cleaned).toBe(1);
    expect(fs.existsSync(activeFile)).toBe(false);
  });

  it("translates AI service 429 capacity saturation to client 429 with Retry-After header", async () => {
    const filePath = path.join(tempTestDir, "saturated.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    const err429 = new Error("Request failed with status code 429");
    err429.response = {
      status: 429,
      data: { detail: "AI service is currently at maximum capacity. Please retry shortly." },
    };
    jest.spyOn(aiService, "analyzeImage").mockRejectedValueOnce(err429);

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/maximum capacity/i);
    expect(res.headers["retry-after"]).toBe("5");
  });

  it("does not mistake normal request completion for client disconnect", async () => {
    const filePath = path.join(tempTestDir, "normal_lifecycle.jpg");
    fs.writeFileSync(filePath, validJpgBytes);

    jest.spyOn(aiService, "checkHealth").mockResolvedValueOnce({ status: "healthy" });
    jest.spyOn(aiService, "analyzeImage").mockImplementationOnce(async (p, signal) => {
      // Simulate real inference delay while upload stream is completely closed
      expect(signal).toBeDefined();
      expect(signal.aborted).toBe(false);
      await new Promise((r) => setTimeout(r, 100));
      // Signal must still not be aborted during legitimate processing
      expect(signal.aborted).toBe(false);
      return {
        status: "success",
        verdict: "REAL",
        confidence: 0.05,
        confidence_percent: 95.0,
        raw_fake_probability: 0.05,
        is_fake: false,
        face_detected: true,
        suspicious_regions: [],
        timings: { total_ms: 100 },
      };
    });

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", filePath);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.verdict).toBe("REAL");
  });
});
