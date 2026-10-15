import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    // WHY Vite proxy in development?
    // React on :3000, Node.js on :5000 = different origins = CORS block.
    // Vite proxy intercepts /api/* and forwards to :5000.
    // Browser sees same origin — no CORS headers needed in dev.
    // In production, CORS is configured properly in Express.
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        configure: proxy => {
          proxy.on("error", err => console.error("[Proxy]", err.message));
        },
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },

  build: {
    // WHY manual chunks?
    // Without splitting, one 2MB bundle = slow first paint.
    // With splitting, vendor code is cached separately from app code.
    // A code change only invalidates the app chunk, not the 1MB vendor chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-motion": ["framer-motion"],
          "vendor-icons":  ["lucide-react"],
          "vendor-utils":  ["axios", "react-hot-toast", "clsx"],
        },
      },
    },
    chunkSizeWarningLimit: 500,
    reportCompressedSize: true,
  },

  envPrefix: "VITE_",
});
