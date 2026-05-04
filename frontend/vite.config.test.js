import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // This is the most important line for sub-path deployment
  base: "/test/",

  server: {
    port: 5174,                    // Use a different port for test during dev (optional)
    proxy: {
      "/test/api": {               // Proxy under /test/api during development
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/test\/api/, "/api"),
      },
      "/test/health": {
        target: "http://127.0.0.1:8001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/test\/health/, "/health"),
      },
    },
  },

  build: {
    outDir: "dist-test",           // Output to a separate folder
  },
});