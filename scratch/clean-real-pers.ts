import { createClient } from "@libsql/client";
import { prisma } from "../src/lib/db";

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  throw new Error("Define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN.");
}

const tursoClient = createClient({
  url: TURSO_DATABASE_URL,
  authToken: TURSO_AUTH_TOKEN,
});

async function main() {
  console.log("Cleaning sample PER users from local SQLite (dev.db)...");
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = OFF;`);
  await prisma.$executeRawUnsafe(`DELETE FROM PERProfile;`);
  await prisma.$executeRawUnsafe(`DELETE FROM User WHERE role = 'PER';`);
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys = ON;`);
  console.log(`✅ Removed all PER users and PERProfiles from local dev.db`);

  console.log("Cleaning sample PER users from Turso...");
  try {
    await tursoClient.execute("PRAGMA foreign_keys = OFF;");
    await tursoClient.execute("DELETE FROM PERProfile;");
    const res = await tursoClient.execute("DELETE FROM User WHERE role = 'PER';");
    await tursoClient.execute("PRAGMA foreign_keys = ON;");
    console.log(`✅ Removed PER users from Turso database (${res.rowsAffected} rows deleted)`);
  } catch (e: any) {
    console.warn("Turso clean warning:", e.message);
  }

  console.log("Database clean completed successfully!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
