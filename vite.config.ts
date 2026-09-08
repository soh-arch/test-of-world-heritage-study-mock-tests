import { defineConfig } from "vite";

// GitHub Pages serves the site from /<repo>/. Dev and preview use the same base
// so a path that works locally works when deployed.
export default defineConfig({
  base: "/test-of-world-heritage-study-mock-tests/",
  build: { target: "es2022" },
});
