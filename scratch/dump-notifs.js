const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });
const prisma = new PrismaClient({ adapter });

async function run() {
  try {
    const users = await prisma.user.findMany();
    console.log("=== USERS ===");
    users.forEach(u => console.log(`ID: ${u.id} | Email: ${u.email} | Role: ${u.role} | Region: ${u.regionId}`));

    const cases = await prisma.pACase.findMany({
      include: {
        per: {
          include: {
            user: true
          }
        }
      }
    });
    console.log("\n=== CASES ===");
    cases.forEach(c => console.log(`Code: ${c.code} | CoordinatorId: ${c.coordinatorId} | PER: ${c.per?.user?.name} (UserID: ${c.per?.userId})`));

    const notifs = await prisma.notification.findMany();
    console.log("\n=== NOTIFICATIONS ===");
    notifs.forEach(n => console.log(`ID: ${n.id} | UserId: ${n.userId} | Title: ${n.title} | Msg: ${n.message}`));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
