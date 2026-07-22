import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaD1 } from "@prisma/adapter-d1";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const createPrismaClient = () => {
  const d1Binding = (globalThis as any).DB || (process.env as any)?.DB;
  if (d1Binding) {
    const adapter = new PrismaD1(d1Binding);
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
