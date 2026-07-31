// Bootstrap SEGURO para producción: idempotente, nunca borra nada (sin deleteMany), puede
// correrse cualquier cantidad de veces contra cualquier base (incluida Turso en producción) sin
// riesgo de duplicar ni de pisar datos existentes. Puebla exactamente lo mínimo real para que la
// app funcione: catálogo de instrumentos + settings, los 5 Coordinadores Regionales reales, y
// exactamente 1 Admin si todavía no existe ninguno. No crea PERs, casos ni candidatas — eso se
// hace después, desde la UI, por el admin/coordinador real.
//
// Uso: npx tsx prisma/seed-bootstrap.ts

import { prisma } from "../src/lib/db";
import { SETTINGS_CATALOG, buildInstrumentCatalog } from "./catalog/instruments";
import { REGIONAL_COORDINATORS } from "./catalog/coordinators";

async function upsertSettings() {
  for (const s of SETTINGS_CATALOG) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`Settings: ${SETTINGS_CATALOG.length} verificados/creados.`);
}

async function upsertInstruments(createdByUserId: string) {
  const catalog = buildInstrumentCatalog(createdByUserId);
  let created = 0;
  for (const inst of catalog) {
    const existing = inst.activityKey
      ? await prisma.instrument.findFirst({ where: { activityKey: inst.activityKey } })
      : await prisma.instrument.findFirst({ where: { name: inst.name, stageId: null } });
    if (!existing) {
      await prisma.instrument.create({ data: inst });
      created++;
    }
  }
  console.log(`Instrumentos: ${created} nuevos creados, ${catalog.length - created} ya existían.`);
}

async function upsertCoordinators() {
  for (const c of REGIONAL_COORDINATORS) {
    await prisma.user.upsert({
      where: { email: c.email },
      update: {},
      create: {
        name: c.name,
        email: c.email,
        role: "COORDINATOR",
        regionId: c.regionId,
        active: true,
        isDemo: false,
      },
    });
  }
  console.log(`Coordinadores regionales: ${REGIONAL_COORDINATORS.length} verificados/creados.`);
}

async function ensureAdmin(): Promise<string> {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    console.log(`Admin ya existe (${existingAdmin.email}), no se crea otro.`);
    return existingAdmin.id;
  }
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || "admin@per2026.cl";
  const admin = await prisma.user.create({
    data: {
      name: "Administrador",
      email,
      role: "ADMIN",
      active: true,
      isDemo: false,
    },
  });
  console.log(`Admin creado: ${email}. Ingresa con la contraseña de REAL_MODE_PASSWORD (o P455w0rd! si no está configurada).`);
  return admin.id;
}

async function main() {
  console.log("Bootstrap de produccion: catalogo + coordinaciones reales + admin (idempotente, sin borrar nada)...");
  const adminId = await ensureAdmin();
  await upsertSettings();
  await upsertInstruments(adminId);
  await upsertCoordinators();
  console.log("Bootstrap completado.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error en el bootstrap:", err);
  process.exit(1);
});
