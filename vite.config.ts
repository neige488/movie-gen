import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@domain": path.resolve(__dirname, "src/domain"),
      "@adapter": path.resolve(__dirname, "src/adapter"),
      "@web": path.resolve(__dirname, "src/web"),
    },
  },
  root: "src/web/client",
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://localhost:5174",
    },
  },
  build: {
    outDir: "../../../dist/client",
    emptyOutDir: true,
  },
});
