const { createClient } = require('@libsql/client');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
  const deletedLocal = await prisma.user.deleteMany({
    where: {
      role: "PER",
    },
  });
  console.log(`✅ Removed ${deletedLocal.count} PER users from local dev.db`);

  console.log("Cleaning sample PER users from Turso...");
  try {
    const res = await tursoClient.execute("DELETE FROM User WHERE role = 'PER'");
    console.log(`✅ Removed ${res.rowsAffected} PER users from Turso database`);
  } catch (e) {
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
