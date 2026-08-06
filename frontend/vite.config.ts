import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND = "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    proxy: {
      "/api": {
        target: BACKEND,
        changeOrigin: true,
        ws: true,
        proxyTimeout: 0,
      },
    },
  },
});
