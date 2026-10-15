const request = require("supertest");
const app = require("../src/app");
const { connectTestDB, clearTestDB, disconnectTestDB } = require("./setup");

describe("Authentication API", () => {
  beforeAll(async () => {
    await connectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  const testUser = {
    name: "DeepGuard Test User",
    email: "test@deepguard.local",
    password: "Password123!",
  };

  it("registers a new user successfully", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data).toHaveProperty("accessToken");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("prevents duplicate registration with the same email", async () => {
    await request(app).post("/api/auth/register").send(testUser);
    const res = await request(app).post("/api/auth/register").send(testUser);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it("logs in an existing user with valid credentials", async () => {
    await request(app).post("/api/auth/register").send(testUser);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("rejects login with an invalid password", async () => {
    await request(app).post("/api/auth/register").send(testUser);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: "WrongPassword999!" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("refreshes access token with valid refresh cookie", async () => {
    const regRes = await request(app).post("/api/auth/register").send(testUser);
    const cookies = regRes.headers["set-cookie"];

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("accessToken");
  });

  it("logs out and clears refresh token", async () => {
    const regRes = await request(app).post("/api/auth/register").send(testUser);
    const cookies = regRes.headers["set-cookie"];
    const token = regRes.body.data.accessToken;

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
