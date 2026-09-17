import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      host: true,            // listen on 0.0.0.0 so ngrok can reach the dev server
      port: 5173,
      allowedHosts: true,    // accept the random *.ngrok-free.app host header
      hmr: {
        clientPort: 443,     // hot-reload websocket works through ngrok's HTTPS
      },
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/health": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});

