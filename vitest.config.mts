import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": path.join(root, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    testTimeout: 30_000,
    env: {
      DATABASE_URL: "file:./test.db",
      DEMO_ORGANIZATION_SLUG: "helios-community",
      GRANTOPS_TEST: "1",
      EMBEDDING_PROVIDER: "local",
    },
  },
});
