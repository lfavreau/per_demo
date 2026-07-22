import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const createPrismaClient = () => {
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
    const adapter = new PrismaLibSql({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    return new PrismaClient({ adapter });
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
  const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
