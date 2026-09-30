import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    // Production build is served under /locator/; dev server stays at /
    base: command === "build" ? "/locator/" : "/",

    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: true,
      hmr: {
        clientPort: 443,
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