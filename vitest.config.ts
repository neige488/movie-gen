import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/domain/**", "src/adapter/**"],
    },
  },
  resolve: {
    alias: {
      "@domain": path.resolve(__dirname, "src/domain"),
      "@adapter": path.resolve(__dirname, "src/adapter"),
      "@web": path.resolve(__dirname, "src/web"),
    },
  },
});
