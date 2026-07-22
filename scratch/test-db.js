const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({ url: "file:prisma/dev.db" });
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    console.log("Checking prisma.notification:", prisma.notification);
    const count = await prisma.notification.count();
    console.log("Notifications count:", count);
  } catch (err) {
    console.error("Error in scratch script:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
