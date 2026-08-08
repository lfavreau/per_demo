import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" revienta a propósito fuera del bundler de Next — se reemplaza por un no-op.
      "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only-stub.ts"),
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Un solo archivo SQLite compartido por toda la batería: correr en serie evita
    // SQLITE_BUSY entre workers escribiendo a la vez.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    env: {
      LOCAL_SQLITE_URL: "file:tests/.tmp/test.db",
    },
  },
});
