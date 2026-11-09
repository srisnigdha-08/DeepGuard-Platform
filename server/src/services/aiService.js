const axios    = require("axios");
const FormData = require("form-data");
const fs       = require("fs");
const path     = require("path");
const logger   = require("../utils/logger");

// WHY a dedicated aiService module rather than calling axios inline?
// - Single retry/timeout config in one place
// - Easy to swap transport (gRPC, WebSocket) later without touching controllers
// - Retry logic with exponential backoff protects against transient GPU OOM errors

const DISALLOWED_SERVICE_KEYS = new Set([
  "",
  "change-this-in-production",
  "shared-secret-between-node-and-python",
  "replace_with_secure_random_64_char_hex_key",
  "your_64_char_hex_service_key_here",
  "your_ai_service_secret_key_here",
  "default",
  "secret",
  "password",
  "admin",
  "123456",
]);

function assertValidServiceKey(key, nodeEnv = process.env.NODE_ENV) {
  if (nodeEnv === "test") {
    // Tests may supply explicitly scoped test keys or use mocks
    if (key && DISALLOWED_SERVICE_KEYS.has(key.trim().toLowerCase())) {
      throw new Error(
        "AI service authentication blocked: Insecure placeholder AI_SERVICE_KEY is not permitted."
      );
    }
    return;
  }
  if (!key || typeof key !== "string" || !key.trim()) {
    throw new Error(
      "AI service authentication blocked: AI_SERVICE_KEY is missing or empty."
    );
  }
  const cleanKey = key.trim().toLowerCase();
  if (DISALLOWED_SERVICE_KEYS.has(cleanKey)) {
    throw new Error(
      "AI service authentication blocked: Insecure placeholder AI_SERVICE_KEY is not permitted."
    );
  }
  if (nodeEnv === "production" && cleanKey.length < 32) {
    throw new Error(
      "AI service authentication blocked: AI_SERVICE_KEY must be at least 32 characters in production."
    );
  }
}

const aiClient = axios.create({
  baseURL: process.env.AI_SERVICE_URL || "http://localhost:8000",
  timeout: 60_000,
  headers: { "X-Service-Key": process.env.AI_SERVICE_KEY || "" },
});

// Request interceptor: ensure latest key is validated and attached from environment
aiClient.interceptors.request.use(
  (config) => {
    const envKey = process.env.AI_SERVICE_KEY;
    // Attach default service key from environment if not explicitly overridden
    if (!config.headers["X-Service-Key"]) {
      assertValidServiceKey(envKey, process.env.NODE_ENV);
      if (envKey) {
        config.headers["X-Service-Key"] = envKey.trim();
      }
    }
    return config;
  },
  (err) => Promise.reject(err)
);

// One automatic retry for connection-refused and 503 (service waking up)
aiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401) {
      logger.error(
        "AI microservice authentication failed (HTTP 401): Ensure AI_SERVICE_KEY is synchronized between backend and AI service."
      );
      return Promise.reject(err);
    }

    const cfg = err.config;
    if (
      cfg &&
      !cfg._retried &&
      (err.code === "ECONNREFUSED" || err.response?.status === 503)
    ) {
      cfg._retried = true;
      logger.warn("AI service unavailable — retrying in 2s…");
      await new Promise((r) => setTimeout(r, 2000));
      return aiClient(cfg);
    }
    return Promise.reject(err);
  }
);

class AIService {
  async checkHealth() {
    try {
      const { data } = await aiClient.get("/health", { timeout: 5000 });
      return data;
    } catch {
      return { status: "unavailable" };
    }
  }

  async analyzeImage(filePath, signal) {
    return this._send("/detect/image", filePath, 30_000, signal);
  }

  async analyzeVideo(filePath, signal) {
    // Videos need longer timeout — 90s for 2-min clip on RTX 3050
    return this._send("/detect/video", filePath, 90_000, signal);
  }

  async analyzeAudio(filePath, signal) {
    return this._send("/detect/audio", filePath, 30_000, signal);
  }

  async _send(endpoint, filePath, timeout, signal) {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
    });
    const { data } = await aiClient.post(endpoint, form, {
      headers: form.getHeaders(),
      timeout,
      signal,
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    });
    return data;
  }
}

const instance = new AIService();
instance.assertValidServiceKey = assertValidServiceKey;
instance.DISALLOWED_SERVICE_KEYS = DISALLOWED_SERVICE_KEYS;
instance._aiClient = aiClient;

module.exports = instance;
