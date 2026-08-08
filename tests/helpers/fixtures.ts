import { prisma } from "@/lib/db";

let counter = 0;
/** Sufijo corto y único por llamada, para no colisionar entre tests (emails, regiones, etc). */
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

/** Región de prueba aislada: cada test que la necesite pide la suya, así nunca comparten cupo. */
export function testRegion(): string {
  return uid("TestRegion");
}

export async function createAdmin(overrides: Partial<{ isDemo: boolean }> = {}) {
  return prisma.user.create({
    data: {
      name: "Admin de Prueba",
      email: `${uid("admin")}@per2026.cl`,
      role: "ADMIN",
      active: true,
      isDemo: overrides.isDemo ?? true,
    },
  });
}

export async function createCoordinator(regionId: string, isDemo = true) {
  return prisma.user.create({
    data: {
      name: "Coordinador de Prueba",
      email: `${uid("coord")}@per2026.cl`,
      role: "COORDINATOR",
      regionId,
      active: true,
      isDemo,
    },
  });
}

interface CreatePerOptions {
  certificationStatus?: "PENDIENTE" | "HABILITADO" | "NO_HABILITADO";
  isDemo?: boolean;
  coordinatorId?: string;
}

/** Crea User + PERProfile habilitado por defecto (matching el default real desde Etapa 0). */
export async function createPer(regionId: string, opts: CreatePerOptions = {}) {
  const isDemo = opts.isDemo ?? true;
  const user = await prisma.user.create({
    data: {
      name: "PER de Prueba",
      email: `${uid("per")}@per2026.cl`,
      role: "PER",
      regionId,
      active: true,
      isDemo,
    },
  });
  const profile = await prisma.pERProfile.create({
    data: {
      userId: user.id,
      regionId,
      coordinatorId: opts.coordinatorId,
      generation: "PRIMERA",
      certificationStatus: opts.certificationStatus ?? "HABILITADO",
    },
  });
  return { user, profile };
}

interface CreateCandidateOptions {
  status?: string;
  isDemo?: boolean;
}

export async function createCandidate(regionId: string, opts: CreateCandidateOptions = {}) {
  return prisma.pACandidate.create({
    data: {
      regionId,
      sourceCenter: "Centro de Prueba",
      status: opts.status ?? "SELECCIONADA",
      gender: "Femenino",
      ageRange: "18-29",
      educationLevel: "Media",
      employmentStatus: "Desocupado",
      isDemo: opts.isDemo ?? true,
    },
  });
}

/** Instrumento ad-hoc, fuera del catálogo oficial, para pruebas que solo necesitan un Task válido. */
export async function createAdHocInstrument(
  creatorId: string,
  overrides: Partial<{
    criticalTask: boolean;
    mandatory: boolean;
    status: string;
    stageId: string | null;
    activityKey: string | null;
  }> = {}
) {
  return prisma.instrument.create({
    data: {
      name: uid("Instrumento de Prueba"),
      type: "MANUAL_TASK",
      phaseId: "FASE_4",
      stageId: overrides.stageId ?? null,
      activityKey: overrides.activityKey ?? null,
      submissionMode: "EXTERNAL_LINK",
      targetRole: "PER",
      scope: "REGIONAL",
      version: "1.0",
      status: overrides.status ?? "VIGENTE",
      mandatory: overrides.mandatory ?? true,
      criticalTask: overrides.criticalTask ?? false,
      defaultDueDays: 10,
      createdByUserId: creatorId,
    },
  });
}
