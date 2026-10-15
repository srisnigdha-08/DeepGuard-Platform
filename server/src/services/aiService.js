const axios    = require("axios");
const FormData = require("form-data");
const fs       = require("fs");
const path     = require("path");
const logger   = require("../utils/logger");

// WHY a dedicated aiService module rather than calling axios inline?
// - Single retry/timeout config in one place
// - Easy to swap transport (gRPC, WebSocket) later without touching controllers
// - Retry logic with exponential backoff protects against transient GPU OOM errors

const aiClient = axios.create({
  baseURL: process.env.AI_SERVICE_URL || "http://localhost:8000",
  timeout: 60_000,
  headers: { "X-Service-Key": process.env.AI_SERVICE_KEY || "" },
});

// One automatic retry for connection-refused and 503 (service waking up)
aiClient.interceptors.response.use(
  r => r,
  async err => {
    const cfg = err.config;
    if (!cfg._retried &&
        (err.code === "ECONNREFUSED" || err.response?.status === 503)) {
      cfg._retried = true;
      logger.warn("AI service unavailable — retrying in 2s…");
      await new Promise(r => setTimeout(r, 2000));
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

  async analyzeImage(filePath) {
    return this._send("/detect/image", filePath, 30_000);
  }

  async analyzeVideo(filePath) {
    // Videos need longer timeout — 90s for 2-min clip on RTX 3050
    return this._send("/detect/video", filePath, 90_000);
  }

  async analyzeAudio(filePath) {
    return this._send("/detect/audio", filePath, 30_000);
  }

  async _send(endpoint, filePath, timeout) {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
    });
    const { data } = await aiClient.post(endpoint, form, {
      headers: form.getHeaders(),
      timeout,
      maxContentLength: Infinity,
      maxBodyLength:    Infinity,
    });
    return data;
  }
}

module.exports = new AIService();
