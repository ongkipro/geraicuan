import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.integration.test.ts"],
    // T-197: a test fails when one pg client receives a query while it runs another.
    setupFiles: ["./tests/pg-query-overlap-guard.ts"],
    fileParallelism: false,
  },
});
