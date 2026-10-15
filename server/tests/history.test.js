const request = require("supertest");
const app = require("../src/app");
const DetectionResult = require("../src/models/DetectionResult");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");

describe("History & Analytics API", () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    const regRes = await request(app).post("/api/auth/register").send({
      name: "History Tester",
      email: "history@deepguard.local",
      password: "Password123!",
    });
    authToken = regRes.body.data.accessToken;
    userId = regRes.body.data.user.id;

    // Seed test results
    await DetectionResult.create([
      {
        userId,
        mediaType: "image",
        originalFilename: "real_face.jpg",
        verdict: "REAL",
        confidence: 0.05,
        confidencePercent: 95.0,
        isFake: false,
        faceDetected: true,
        status: "completed",
      },
      {
        userId,
        mediaType: "video",
        originalFilename: "fake_clip.mp4",
        verdict: "FAKE",
        confidence: 0.88,
        confidencePercent: 88.0,
        isFake: true,
        faceDetected: true,
        status: "completed",
      },
    ]);
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  it("lists history for authenticated user", async () => {
    const res = await request(app)
      .get("/api/history")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.results.length).toBe(2);
    expect(res.body.data.pagination.total).toBe(2);
  });

  it("filters history by mediaType", async () => {
    const res = await request(app)
      .get("/api/history?mediaType=video")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(1);
    expect(res.body.data.results[0].originalFilename).toBe("fake_clip.mp4");
  });

  it("filters history by verdict", async () => {
    const res = await request(app)
      .get("/api/history?verdict=REAL")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(1);
    expect(res.body.data.results[0].verdict).toBe("REAL");
  });

  it("supports pagination with limit", async () => {
    const res = await request(app)
      .get("/api/history?limit=1&page=1")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBe(1);
    expect(res.body.data.pagination.totalPages).toBe(2);
    expect(res.body.data.pagination.hasNext).toBe(true);
  });

  it("soft deletes a history result", async () => {
    const listRes = await request(app)
      .get("/api/history")
      .set("Authorization", `Bearer ${authToken}`);
    const itemToDelete = listRes.body.data.results[0]._id;

    const delRes = await request(app)
      .delete(`/api/history/${itemToDelete}`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    // Verify it is excluded from list
    const postDelRes = await request(app)
      .get("/api/history")
      .set("Authorization", `Bearer ${authToken}`);
    expect(postDelRes.body.data.results.length).toBe(1);
  });

  it("returns 401 when requesting history without authorization", async () => {
    const res = await request(app).get("/api/history");
    expect(res.status).toBe(401);
  });
});
