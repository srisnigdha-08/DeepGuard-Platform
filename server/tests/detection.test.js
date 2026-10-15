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
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
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

    const res = await request(app)
      .post("/api/detect/image")
      .set("Authorization", `Bearer ${authToken}`)
      .attach("file", exeFile);

    expect(res.status).toBe(500); // Multer extension filter rejects or 415
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
