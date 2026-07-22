import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const getDb = (): PrismaClient => {
  const tursoUrl =
    process.env.TURSO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.STORAGE_URL ||
    process.env.STORAGE_TURSO_DATABASE_URL;
  const tursoAuthToken =
    process.env.TURSO_AUTH_TOKEN ||
    process.env.STORAGE_AUTH_TOKEN ||
    process.env.STORAGE_TURSO_AUTH_TOKEN;

  // 1. Turso Database (LibSQL)
  if (tursoUrl && (tursoUrl.startsWith("libsql:") || tursoUrl.startsWith("https:"))) {
    try {
      const { PrismaLibSql } = require("@prisma/adapter-libsql");
      const adapter = new PrismaLibSql({
        url: tursoUrl,
        authToken: tursoAuthToken,
      });
      return new PrismaClient({ adapter });
    } catch (err1) {
      try {
        const { createClient } = require("@libsql/client");
        const { PrismaLibSql } = require("@prisma/adapter-libsql");
        const libsql = createClient({ url: tursoUrl, authToken: tursoAuthToken });
        const adapter = new PrismaLibSql(libsql);
        return new PrismaClient({ adapter });
      } catch (err2) {
        console.error("Failed to initialize Turso adapter:", err2);
      }
    }
  }

  // 2. Cloudflare Workers D1 Context
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    if (ctx?.env?.DB) {
      const { PrismaD1 } = require("@prisma/adapter-d1");
      const adapter = new PrismaD1(ctx.env.DB);
      return new PrismaClient({ adapter });
    }
  } catch (e) {}

  // 3. Local SQLite fallback (dev.db)
  try {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
    return new PrismaClient({ adapter });
  } catch (e) {
    return new PrismaClient();
  }
};

export const prisma = globalForPrisma.prisma || new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb() as any;
    const value = client[prop];
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
