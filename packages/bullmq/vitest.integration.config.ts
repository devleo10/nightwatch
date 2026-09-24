import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@devleo10/nightwatch-classifier": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
})
