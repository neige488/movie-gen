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
    // Overridable so parallel git worktrees (e.g. main + a movie branch) can
    // each run their own dev server without port collisions. Defaults match
    // the single-checkout setup.
    port: Number(process.env.MOVIEGEN_CLIENT_PORT ?? 5173),
    host: true,
    proxy: {
      "/api": `http://localhost:${process.env.MOVIEGEN_PORT ?? 5174}`,
      // Binary assets are served by the Express server, not Vite. Without this
      // the browser's <img src="/assets/..."> falls through to Vite's SPA
      // fallback (index.html), so uploaded/existing images never render in dev.
      "/assets": `http://localhost:${process.env.MOVIEGEN_PORT ?? 5174}`,
    },
  },
  build: {
    outDir: "../../../dist/client",
    emptyOutDir: true,
  },
});
