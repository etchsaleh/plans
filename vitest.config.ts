import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    environment: "node",
    // DB integration tests are opt-in via DATABASE_URL; they live in *.db.test.ts
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
