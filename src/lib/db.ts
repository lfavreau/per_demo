import { PrismaClient } from "@prisma/client";
import { createClient } from "@libsql/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const createPrismaClient = () => {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.STORAGE_TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || process.env.STORAGE_AUTH_TOKEN || process.env.STORAGE_TURSO_AUTH_TOKEN;

  if (tursoUrl && (tursoUrl.startsWith("libsql:") || tursoUrl.startsWith("https:"))) {
    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoAuthToken,
    });
    const adapter = new PrismaLibSql(libsql as any);
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
