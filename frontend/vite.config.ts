import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const BACKEND =
  process.env.CATODO_BACKEND_URL || `http://${process.env.CATODO_HOST || "127.0.0.1"}:${process.env.CATODO_PORT || "8765"}`;

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
