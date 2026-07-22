import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const getDb = (): PrismaClient => {
  // 1. Turso Database (LibSQL) Support
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && (tursoUrl.startsWith("libsql:") || tursoUrl.startsWith("https:"))) {
    try {
      const { createClient } = require("@libsql/client");
      const { PrismaLibSQL } = require("@prisma/adapter-libsql");
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoAuthToken,
      });
      const adapter = new PrismaLibSQL(libsql);
      return new PrismaClient({ adapter });
    } catch (e) {
      console.error("Error initializing Turso adapter:", e);
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

  // 3. Other Cloud Database Context (Postgres, Neon, Accelerate)
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("file:")) {
    return new PrismaClient();
  }

  // 4. Local Node.js SQLite fallback (dev.db)
  try {
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const dbUrl = process.env.DATABASE_URL || "file:dev.db";
    const adapter = new PrismaBetterSqlite3({ url: dbUrl.replace("file:", "") });
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
