import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});

