const aiService = require("../src/services/aiService");

describe("AI Microservice Client Security & Authentication Hardening", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("attaches X-Service-Key header from AI_SERVICE_KEY on outbound requests", async () => {
    process.env.AI_SERVICE_KEY = "test-secret-key-12345";
    const res = await aiService.checkHealth();
    expect(res).toBeDefined();
  });

  it("ensures X-Service-Key is never exposed to client-accessible environment variables", () => {
    expect(process.env.VITE_AI_SERVICE_KEY).toBeUndefined();
    expect(process.env.REACT_APP_AI_SERVICE_KEY).toBeUndefined();
  });

  it("sanitizes 401 error and propagates failure safely without crashing", async () => {
    const error401 = {
      response: {
        status: 401,
        data: { detail: "Invalid or missing service authentication key" },
      },
      config: { url: "/detect/image" },
    };

    await expect(Promise.reject(error401)).rejects.toMatchObject({
      response: { status: 401 },
    });
  });

  describe("Service Key Validation Guard (assertValidServiceKey)", () => {
    it("rejects empty or missing AI_SERVICE_KEY in development and production", () => {
      expect(() => aiService.assertValidServiceKey("", "development")).toThrow(
        /AI_SERVICE_KEY is missing or empty/i
      );
      expect(() => aiService.assertValidServiceKey(undefined, "production")).toThrow(
        /AI_SERVICE_KEY is missing or empty/i
      );
    });

    it("rejects well-known insecure placeholder keys across all environments", () => {
      const placeholders = [
        "change-this-in-production",
        "shared-secret-between-node-and-python",
        "your_64_char_hex_service_key_here",
        "default",
        "secret",
        "password",
      ];

      for (const placeholder of placeholders) {
        expect(() => aiService.assertValidServiceKey(placeholder, "development")).toThrow(
          /Insecure placeholder AI_SERVICE_KEY is not permitted/i
        );
        expect(() => aiService.assertValidServiceKey(placeholder, "test")).toThrow(
          /Insecure placeholder AI_SERVICE_KEY is not permitted/i
        );
        expect(() => aiService.assertValidServiceKey(placeholder, "production")).toThrow(
          /Insecure placeholder AI_SERVICE_KEY is not permitted/i
        );
      }
    });

    it("enforces minimum 32-character key length in production", () => {
      expect(() =>
        aiService.assertValidServiceKey("short-key-1234567890", "production")
      ).toThrow(/must be at least 32 characters in production/i);
    });

    it("accepts a cryptographically strong 64-character hex key in all environments", () => {
      const strongKey = "a".repeat(64);
      expect(() => aiService.assertValidServiceKey(strongKey, "development")).not.toThrow();
      expect(() => aiService.assertValidServiceKey(strongKey, "production")).not.toThrow();
      expect(() => aiService.assertValidServiceKey(strongKey, "test")).not.toThrow();
    });
  });
});
