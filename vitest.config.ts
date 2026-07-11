// Frontend test configuration (kept separate from vite.config.ts so the dev
// server setup stays untouched). Run with: npx vitest run
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(import.meta.dirname, "client", "src", "test", "setup.ts")],
    include: ["client/src/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
