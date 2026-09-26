import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/web/src/**/*.test.{ts,tsx}",
      "contracts/src/**/*.test.ts",
      "services/api/src/**/*.test.ts",
    ],
    environment: "node",
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: ["apps/web/src/**/*.{ts,tsx}", "contracts/src/**/*.ts", "services/api/src/**/*.ts"],
      exclude: ["**/*.test.{ts,tsx}"],
      reporter: ["text", "json-summary", "html"],
    },
  },
});
