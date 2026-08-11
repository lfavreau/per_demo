/**
 * Prepara una base SQLite desechable para la batería de pruebas: copia el schema vigente
 * desde dev.db (fuente de verdad local, mantenida al día vía `npx prisma db push`), la deja
 * sin datos transaccionales y siembra el catálogo oficial de instrumentos + settings —
 * exactamente lo que prisma/seed.ts siembra antes de generar datos regionales de demostración.
 *
 * No toca dev.db: solo lo lee para copiar el archivo. Se corre una vez antes de la batería
 * (ver "pretest" en package.json), no en cada test file.
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname } from "node:path";

const TEST_DB_PATH = "tests/.tmp/test.db";

mkdirSync(dirname(TEST_DB_PATH), { recursive: true });
copyFileSync("dev.db", TEST_DB_PATH);

process.env.LOCAL_SQLITE_URL = `file:${TEST_DB_PATH}`;
// Aislar de Turso por si alguna variable de entorno remota quedó cargada en la shell.
delete process.env.TURSO_DATABASE_URL;
delete process.env.DATABASE_URL;
delete process.env.STORAGE_URL;
delete process.env.STORAGE_TURSO_DATABASE_URL;

async function main() {
  const { prisma } = await import("../../src/lib/db");
  const { SETTINGS_CATALOG, buildInstrumentCatalog } = await import("../../prisma/catalog/instruments");

  console.log("Limpiando base de pruebas...");
  // Mismo orden de dependencias que prisma/seed.ts.
  await prisma.setting.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.calendarEventRef.deleteMany();
  await prisma.driveFileRef.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.supervision.deleteMany();
  await prisma.sessionLog.deleteMany();
  await prisma.iAPGoal.deleteMany();
  await prisma.iAPDomainMap.deleteMany();
  await prisma.iAPRecord.deleteMany();
  await prisma.taskEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.caseStatusHistory.deleteMany();
  await prisma.caseStageHistory.deleteMany();
  await prisma.documentRecord.deleteMany();
  await prisma.networkActivation.deleteMany();
  await prisma.networkDevice.deleteMany();
  await prisma.phase5Record.deleteMany();
  await prisma.reportSnapshot.deleteMany();
  await prisma.contactAttempt.deleteMany();
  await prisma.pACase.deleteMany();
  await prisma.pACandidate.deleteMany();
  await prisma.trainingRecord.deleteMany();
  await prisma.pERProfile.deleteMany();
  await prisma.instrument.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();

  console.log("Sembrando settings...");
  for (const s of SETTINGS_CATALOG) {
    await prisma.setting.create({ data: s });
  }

  console.log("Sembrando usuario admin base y catálogo de instrumentos...");
  const admin = await prisma.user.create({
    data: {
      name: "Admin de Pruebas",
      email: "admin.tests@per2026.cl",
      role: "ADMIN",
      active: true,
    },
  });

  const instruments = buildInstrumentCatalog(admin.id);
  for (const inst of instruments) {
    await prisma.instrument.create({ data: inst });
  }

  console.log(`Base de pruebas lista en ${TEST_DB_PATH} (${instruments.length} instrumentos, admin ${admin.id}).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("No se pudo preparar la base de pruebas:", err);
  process.exit(1);
});
