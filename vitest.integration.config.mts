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
    // T-277: render tests import whole pages on first use; under machine load a cold import alone
    // passed 5 s (platform-public-render, 2026-10-06) though the same file runs in 6 s on its own.
    testTimeout: 20_000,
  },
});
