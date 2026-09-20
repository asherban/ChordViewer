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
  },
});
