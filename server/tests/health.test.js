const request = require("supertest");
const app = require("../src/app");

describe("Health Check Endpoint", () => {
  it("GET /api/health returns 200 and healthy status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("status", "healthy");
    expect(res.body).toHaveProperty("ts");
  });

  it("GET /nonexistent returns 404", async () => {
    const res = await request(app).get("/api/nonexistent-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
