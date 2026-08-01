# 🛠️ Plan de Acción — Correcciones Plataforma PER 2026-2027

**Origen**: auditoría de código realizada al construir [Guion.md](Guion.md) y [PruebasUnitarias.md](PruebasUnitarias.md).
**Destinatario**: agente que ejecuta las correcciones.
**Alcance**: 13 correcciones (`F01`–`F13`) en 4 fases, con checkpoint y commit por fase.

---

## 0. Contexto mínimo

**Stack**: Next.js 16 (App Router) · TypeScript · Prisma 7 · SQLite local (`dev.db`) / Turso en producción · Tailwind.

**Comandos**:
```bash
npx tsc --noEmit && npx next lint
```
```bash
npx prisma db push && npx prisma db seed && npm run dev
```

**Reglas del proyecto** (de [CLAUDE.md](CLAUDE.md), respetarlas en cada cambio):
- Nunca registrar datos personales de las personas acompañadas (nombre, RUN). Solo códigos (`PA-MET-001`) y alias.
- Server actions críticas: `try/catch` propagando `redirect()` con `isNextRedirect(error)` ([src/lib/next-errors.ts](src/lib/next-errors.ts)).
- Las migraciones son SQL escrito a mano en `prisma/migrations/<fecha>_<nombre>/migration.sql` y se aplican manualmente contra Turso. `prisma db push` es solo para local.

**Invariante central del sistema** (no romperlo en ningún cambio): el modo **demo** y el modo **real** son universos disjuntos. Toda consulta y toda escritura filtra por `isDemo`. La demo debe ser un espejo poblado del modo real — mismas reglas, mismos formatos, distintos datos.

**Antes de empezar**: crear rama.
```bash
git checkout -b fix/auditoria-agosto-2026
```

---

## 1. Resumen ejecutable

| ID | Severidad | Problema | Archivo principal | Fase |
|---|---|---|---|---|
| `F01` | 🔴 P0 | Snapshot de reportes se sirve cruzado entre demo y real | `admin/reportes/page.tsx` | 1 |
| `F02` | 🔴 P0 | Los códigos de caso reales arrancan corridos por los casos demo | `cases.service.ts` + migración | 1 |
| `F03` | 🔴 P0 | Abreviatura de Los Ríos inconsistente (`LOS` en seed vs `RIO` en código) | `cases.service.ts` | 1 |
| `F04` | 🟠 P1 | KPI de evaluaciones intermedias siempre devuelve 0 | `admin/reportes/page.tsx` | 2 |
| `F05` | 🟠 P1 | `regionId` con fallback `"MET"` crea registros en región inexistente | `coordinator.ts`, `tasks.service.ts` | 2 |
| `F06` | 🟠 P1 | El PER puede marcar `NO_APLICA` y saltarse la puerta de etapa solo | `actions/itinerary.ts` | 2 |
| `F07` | 🟠 P1 | La barrera de deserción se elude escribiendo "forzada" en el motivo | `cases.service.ts` | 2 |
| `F08` | 🟠 P1 | Habilitar/suspender PER sin validar región ni modo, y sin auditoría | `coordinator.ts` | 2 |
| `F09` | 🟡 P2 | Server actions tragan errores: fallos silenciosos en la UI | `actions/*.ts` + componentes | 3 |
| `F10` | 🟡 P2 | Cálculo de los 8 KPIs embebido en el componente de página | nuevo `reports.service.ts` | 3 |
| `F11` | 🔵 P3 | Notificaciones dicen "Bitácora" en vez de "Registro de Acompañamiento" | `sessions.service.ts` | 4 |
| `F12` | 🔵 P3 | `Manual.md` declara 13 cuentas demo; el modal tiene 16 | `Manual.md` | 4 |
| `F13` | 🔵 P3 | `db.ts` fija `file:dev.db` sin variable de entorno (bloquea pruebas) | `src/lib/db.ts` | 4 |

---

# FASE 1 — Integridad de datos oficiales (P0)

> Objetivo: que el modo real no herede ni contamine nada del modo demo. **Es la fase que no puede esperar**: afecta los códigos oficiales de caso y los indicadores que se rinden a SENDA.

## F01 · Snapshot de reportes cruzado entre modos

**Archivo**: [src/app/(admin)/admin/reportes/page.tsx:46-53](src/app/(admin)/admin/reportes/page.tsx:46)

**Problema**: `freezeSnapshotAction` graba el `ReportSnapshot` con `isDemo`, pero la lectura no filtra por él. Como el snapshot tiene prioridad sobre el cálculo en vivo (línea 57), un admin en modo real puede terminar viendo KPIs congelados en la demo.

**Cambio**:
```ts
// ANTES
frozenSnapshot = await prisma.reportSnapshot.findFirst({
  where: {
    periodKey: selectedPeriod,
    regionId: selectedRegion || null,
  },
});

// DESPUÉS
frozenSnapshot = await prisma.reportSnapshot.findFirst({
  where: {
    periodKey: selectedPeriod,
    regionId: selectedRegion || null,
    isDemo, // ← ya está calculado en la línea 15
  },
  orderBy: { createdAt: "desc" },
});
```

**Verificación**: entrar como admin demo → congelar el Informe 3 → cerrar sesión → entrar como admin real (formulario) → Informe 3 debe mostrar el cálculo en vivo, no el congelado.

---

## F03 · Unificar la abreviatura de Los Ríos

> Ejecutar **antes** de `F02`: `F02` toca la misma función.

**Archivo**: [src/server/services/cases.service.ts:19-27](src/server/services/cases.service.ts:19)

**Problema**: el seed emite `PA-LOS-###` (`reg.key = "LOS"` en [prisma/seed.ts:135](prisma/seed.ts:135)) pero `getRegionAbbreviation()` devuelve `"RIO"`. La demo deja de ser espejo del real.

**Paso previo obligatorio** — comprobar si ya existen casos reales con el prefijo viejo:
```bash
npx tsx -e "import{prisma}from'./src/lib/db';prisma.pACase.findMany({where:{code:{startsWith:'PA-RIO-'}},select:{code:true,isDemo:true}}).then(r=>{console.log(r);process.exit(0)})"
```
- **Sin resultados** (esperado): aplicar el cambio de abajo.
- **Con resultados**: detenerse y consultar al usuario — hay que decidir si se renombran esos códigos o se conserva `RIO`. No renombrar códigos por cuenta propia: son identificadores oficiales ya emitidos.

**Cambio**:
```ts
// ANTES
if (clean.includes("los rios") || clean.includes("ríos")) return "RIO";

// DESPUÉS
// "LOS" es la abreviatura canónica: es la que emite prisma/seed.ts y la que
// aparece en toda la documentación del pilotaje.
if (clean.includes("los rios") || clean.includes("ríos")) return "LOS";
```

**Verificación**: crear una dupla en Los Ríos desde `/coordinacion/candidatas` → el código nuevo debe seguir la serie `PA-LOS-###`.

---

## F02 · Códigos de caso reales corridos por los datos demo

**Archivos**: [src/server/services/cases.service.ts:36-46](src/server/services/cases.service.ts:36), [prisma/schema.prisma:74](prisma/schema.prisma:74), nueva migración.

**Problema**: `PACase.code` es `@unique` global, así que `generatePaCode()` cuenta **todos** los casos de la región ignorando `isDemo` para no chocar. Consecuencia: con 4 casos demo en Metropolitana, el primer caso **real** se llama `PA-MET-005`. Los códigos oficiales del pilotaje quedan numerados en función de cuántos datos de prueba existan.

**Solución**: hacer la unicidad compuesta `(code, isDemo)` y volver a contar por modo. Cada universo tiene su propia serie desde `001`.

### F02.a — Esquema

```prisma
// prisma/schema.prisma, model PACase
// ANTES
code String @unique // PA-{REGION}-{NNN}

// DESPUÉS
code String // PA-{REGION}-{NNN} — único por modo, ver @@unique al final del modelo
```

Y al final del bloque `model PACase { ... }`, junto a los `@@index` existentes:
```prisma
@@unique([code, isDemo])
```

### F02.b — Migración

Crear `prisma/migrations/20260801_codigo_caso_por_modo/migration.sql`:

```sql
-- El código de caso pasa a ser único POR MODO (demo/real) en vez de global.
-- Motivo: con unicidad global, el contador que genera el correlativo debía incluir
-- los casos demo, y el primer caso real de una región heredaba su numeración.
-- Solo cambia índices, cero datos. Segura contra bases con datos existentes
-- siempre que no haya un mismo `code` repetido dentro del mismo `isDemo`.

DROP INDEX IF EXISTS "PACase_code_key";
CREATE UNIQUE INDEX "PACase_code_isDemo_key" ON "PACase"("code", "isDemo");
```

### F02.c — Servicio

```ts
// src/server/services/cases.service.ts
// ANTES
async function generatePaCode(regionId: string): Promise<string> {
  const abbr = getRegionAbbreviation(regionId);
  let sequential = (await prisma.pACase.count({ where: { regionId } })) + 1;
  let code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  while (await prisma.pACase.findUnique({ where: { code } })) {
    sequential++;
    code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  }
  return code;
}

// DESPUÉS
// El correlativo es por región Y por modo: demo y real llevan series independientes,
// de modo que el primer caso real de una región siempre es 001 aunque existan casos
// demo. La unicidad en base de datos es @@unique([code, isDemo]).
async function generatePaCode(regionId: string, isDemo: boolean): Promise<string> {
  const abbr = getRegionAbbreviation(regionId);
  let sequential = (await prisma.pACase.count({ where: { regionId, isDemo } })) + 1;
  let code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  // Loop defensivo por si el conteo no refleja códigos ya tomados (casos eliminados,
  // creados fuera de orden, etc.)
  while (await prisma.pACase.findFirst({ where: { code, isDemo }, select: { id: true } })) {
    sequential++;
    code = `PA-${abbr}-${String(sequential).padStart(3, "0")}`;
  }
  return code;
}
```

**Actualizar las dos llamadas** (el compilador las señala):
- `createCaseFromCandidate` línea ~81: `await generatePaCode(candidate.regionId)` → `await generatePaCode(candidate.regionId, isDemo)`
- `createDirectContinuityCase` línea ~573: `await generatePaCode(regionId)` → `await generatePaCode(regionId, isDemo)`

> `createCaseFromCandidate` genera el código dentro de una `$transaction` usando el cliente global `prisma`, no `tx`. Dejarlo así (el `while` es una lectura defensiva); no cambiar a `tx` en este fix.

**Verificación**:
```bash
npx prisma db push && npx prisma db seed
```
Entrar en modo **real** como `coord.metro` (formulario, contraseña real) → crear un caso de continuidad directa en Metropolitana → debe salir **`PA-MET-001`**, conviviendo con los `PA-MET-001..004` demo.

> No es necesario tocar `coordinacion/casos/page.tsx:81`: ya consulta con `findFirst({ where: { code, regionId, isDemo } })`.

### Checkpoint Fase 1
```bash
npx tsc --noEmit && npx next lint
```
```bash
git add -A && git commit -m "fix(datos): aislar snapshots por modo, serie de codigos de caso por modo y unificar abreviatura de Los Rios"
```

---

# FASE 2 — Bugs funcionales y huecos de control (P1)

## F04 · KPI de evaluaciones intermedias siempre 0

**Archivo**: [src/app/(admin)/admin/reportes/page.tsx:296-303](src/app/(admin)/admin/reportes/page.tsx:296)

**Problema**: compara contra un nombre de instrumento que no existe. El catálogo lo llama `"Actividad 5: Evaluación conjunta del proceso (Intermedia)"` ([prisma/catalog/instruments.ts:251](prisma/catalog/instruments.ts:251)).

**Cambio**:
```ts
// ANTES
if (t.instrument?.name === "Evaluación Intermedia" && t.status === "VALIDADA") {

// DESPUÉS
// Comparar por activityKey (clave estable del catálogo), no por nombre visible:
// el nombre es editable desde /admin/instrumentos y rompería el indicador.
if (t.instrument?.activityKey === "ACTIVIDAD_5_INTERMEDIA" && t.status === "VALIDADA") {
```

**Verificación**: en modo demo, `/admin/reportes` debe mostrar un conteo > 0 de evaluaciones intermedias (los casos en Conexión del seed las tienen).

> Revisar en el mismo archivo si hay otros `instrument?.name ===` comparando por nombre visible y migrarlos igual a `activityKey`.

---

## F05 · `regionId` con fallback `"MET"`

**Problema**: las regiones se persisten por nombre completo (`"Metropolitana"`). El fallback `"MET"` crea registros en una región que no existe, invisibles para todo coordinador.

**Archivo 1**: [src/app/actions/coordinator.ts:659](src/app/actions/coordinator.ts:659) (`createCandidateAction`)
```ts
// ANTES
const regionId = user.regionId || (formData.get("regionId") as string) || "MET";

// DESPUÉS
const regionId = user.regionId || (formData.get("regionId") as string);
if (!regionId) {
  throw new Error("Región no especificada");
}
```
(mismo patrón que ya usan `registerNetworkDeviceAction` y `registerPhase5RecordAction` en ese archivo)

**Archivo 2**: [src/server/services/tasks.service.ts:61](src/server/services/tasks.service.ts:61) (`assignTask`)
```ts
// ANTES
regionId: assignedUser.regionId || "MET",

// DESPUÉS
regionId: assignedUser.regionId ?? (() => { throw new Error("El usuario asignado no tiene región"); })(),
```
Alternativa más limpia — validar arriba, junto al chequeo de `assignedUser`:
```ts
const assignedUser = await tx.user.findUnique({ where: { id: assignedToUserId } });
if (!assignedUser) throw new Error("Usuario asignado no encontrado");
if (!assignedUser.regionId) throw new Error("El usuario asignado no tiene región asignada");
// ... luego usar `regionId: assignedUser.regionId`
```

**Verificación**: el formulario de alta de candidata como ADMIN sin región debe fallar con mensaje claro, no crear un registro huérfano.

---

## F06 · El PER puede saltarse la puerta de etapa con `NO_APLICA`

**Archivo**: [src/app/actions/itinerary.ts:59-72](src/app/actions/itinerary.ts:59)

**Problema**: la acción acepta rol `PER`, y `assertStageAdvanceAllowed` cuenta `NO_APLICA` como resuelto ([itinerary.service.ts:321](src/server/services/itinerary.service.ts:321)). Un acompañante puede declarar no aplicable su propio instrumento obligatorio y desbloquear el avance sin que coordinación intervenga.

**Cambio**:
```ts
// ANTES
if (user.role !== "PER" && user.role !== "COORDINATOR" && user.role !== "ADMIN") {
  throw new Error("No autorizado");
}

// DESPUÉS
// Marcar un instrumento como NO_APLICA satisface la puerta de avance de etapa
// (ver assertStageAdvanceAllowed), así que es una decisión metodológica de
// coordinación — nunca del propio PER que debe completarlo.
if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
  throw new Error("No autorizado");
}
```

**Además**: verificar si algún componente del PER expone este botón.
```bash
grep -rn "markStepNotApplicable" src/components/ src/app/
```
Si aparece en `src/components/per/*`, quitar el control de la UI del PER; si está en `src/components/coordinator/*`, dejarlo.

**Verificación**: `markStepNotApplicableAction` invocada con sesión PER debe lanzar *No autorizado*.

---

## F07 · La barrera de deserción se elude escribiendo "forzada"

**Archivo**: [src/server/services/cases.service.ts:416-421](src/server/services/cases.service.ts:416)

**Problema**: basta incluir la palabra "forzada" en el motivo para saltarse el requisito de 3 intentos de contacto — y, a diferencia del forzado de etapa, no deja auditoría específica.

**Cambio**: usar un flag explícito y auditar el salto, igual que `FORCE_STAGE_ADVANCE`.

```ts
// cases.service.ts — firma
export async function transitionCaseStatus(
  caseId: string,
  toStatus: string,
  reason: string,
  actorId: string,
  isDemo: boolean,
  forceAdvance = false,
  forceDesertion = false, // ← nuevo
) {

// ANTES
if (toStatus === "DESERCION") {
  const attempts = await tx.contactAttempt.count({ where: { paCaseId: caseId } });
  if (attempts < 3 && !reason.toLowerCase().includes("forzada")) {
    throw new Error("No se puede marcar deserción sin registrar al menos 3 intentos de contacto fallidos.");
  }
}

// DESPUÉS
if (toStatus === "DESERCION") {
  const attempts = await tx.contactAttempt.count({ where: { paCaseId: caseId } });
  if (attempts < 3) {
    if (!forceDesertion) {
      throw new Error(
        `No se puede marcar deserción sin registrar al menos 3 intentos de contacto fallidos (hay ${attempts}). Puedes forzarlo indicando un motivo.`
      );
    }
    if (!reason || !reason.trim()) {
      throw new Error("Forzar una deserción con menos de 3 intentos de contacto requiere un motivo.");
    }
    await tx.auditLog.create({
      data: {
        userId: actorId,
        role: actor.role,
        action: "FORCE_DESERTION",
        entityType: "PACase",
        entityId: caseId,
        previousValue: paCase.status,
        newValue: JSON.stringify({ toStatus, contactAttempts: attempts }),
        reason,
        isDemo,
      },
    });
  }
}
```

**Y en la acción** [src/app/actions/coordinator.ts:234](src/app/actions/coordinator.ts:234) (`transitionCaseStatusAction`):
```ts
const forceAdvance = formData.get("forceAdvance") === "on";
const forceDesertion = formData.get("forceDesertion") === "on"; // ← nuevo
// ...
await transitionCaseStatus(caseId, toStatus, reason, user.id, user.isDemo, forceAdvance, forceDesertion);
```

**Y en la UI** [src/components/coordinator/WithdrawalGate.tsx](src/components/coordinator/WithdrawalGate.tsx): agregar el checkbox `forceDesertion` visible solo cuando el destino es `DESERCION`, siguiendo el mismo patrón visual que `forceAdvance` en [StageAdvanceButton.tsx:60](src/components/coordinator/StageAdvanceButton.tsx:60).

**Verificación**: caso con 0 intentos de contacto y motivo *"deserción forzada por incomparecencia"* → debe **rechazarse**; con el checkbox marcado → debe pasar y generar `FORCE_DESERTION` en `/admin/auditoria`.

---

## F08 · Habilitar/suspender PER sin validaciones ni auditoría

**Archivo**: [src/app/actions/coordinator.ts:617-645](src/app/actions/coordinator.ts:617) (`updatePerStatusAction`)

**Problema**: es la acción que decide quién puede recibir casos, y hace el `update` directo sin verificar región, sin verificar `isDemo` y sin dejar `AuditLog`. Todas las demás acciones sensibles del módulo hacen al menos dos de las tres cosas.

**Cambio** (reemplazar el cuerpo desde la lectura de `formData`):
```ts
  const perId = formData.get("perId") as string;
  const toStatus = formData.get("status") as string;

  if (!perId || !toStatus) {
    throw new Error("Faltan datos obligatorios");
  }
  if (!["HABILITADO", "PENDIENTE", "NO_HABILITADO"].includes(toStatus)) {
    throw new Error("Estado de certificación inválido");
  }

  const profile = await prisma.pERProfile.findUnique({
    where: { id: perId },
    include: { user: true },
  });
  if (!profile) throw new Error("PER no encontrado");

  // Mismo control regional que el resto de operaciones de coordinación
  if (user.role !== "ADMIN" && user.regionId !== profile.regionId) {
    throw new Error("No autorizado para operar acompañantes de esta región");
  }
  // La habilitación no puede cruzar modos: un coordinador en sesión demo no
  // debe alterar el estado de un PER real, ni al revés.
  if (Boolean(profile.user.isDemo) !== Boolean(user.isDemo)) {
    throw new Error("El acompañante no pertenece al modo de trabajo actual");
  }

  await prisma.$transaction(async (tx) => {
    await tx.pERProfile.update({
      where: { id: perId },
      data: {
        certificationStatus: toStatus,
        certifiedByUserId: user.id,
        certifiedAt: toStatus === "HABILITADO" ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: toStatus === "HABILITADO" ? "HABILITACION_PER" : "SUSPENSION_PER",
        entityType: "PERProfile",
        entityId: perId,
        previousValue: profile.certificationStatus,
        newValue: toStatus,
        isDemo: Boolean(user.isDemo),
      },
    });
  });

  revalidatePath("/coordinacion/supervisiones");
  revalidatePath("/coordinacion/candidatas");
  revalidatePath("/admin");
```

**Verificación**: habilitar un PER desde `/coordinacion/supervisiones` → aparece `HABILITACION_PER` en `/admin/auditoria`; intentarlo sobre un PER de otra región debe fallar.

### Checkpoint Fase 2
```bash
npx tsc --noEmit && npx next lint
```
```bash
git add -A && git commit -m "fix(reglas): corregir KPI de evaluaciones intermedias, fallback de region, gate NO_APLICA, forzado de desercion auditado y control de habilitacion PER"
```

---

# FASE 3 — Robustez y mantenibilidad (P2)

## F09 · Errores silenciosos en server actions

**Problema**: varias acciones capturan la excepción, hacen `console.error` y retornan `void`. Si la operación falla, la pantalla simplemente no cambia y el usuario no se entera.

**Acciones afectadas** (todas con el patrón `catch (err: any) { console.error(...) }`):
| Archivo | Acción |
|---|---|
| [actions/itinerary.ts](src/app/actions/itinerary.ts) | `markStepNotApplicableAction`, `validateItineraryStepAction`, `returnItineraryStepAction` |
| [actions/coordinator.ts](src/app/actions/coordinator.ts) | `validateSessionAction`, `returnSessionAction`, `validateTaskAction`, `returnTaskAction`, `resolveAlertAction`, `triggerAlertRulesAction`, `ensureWithdrawalStepAction` |

**Patrón de corrección**: seguir el que ya usa `transitionCaseStatusAction` — redirigir con el error en la query string, para que la página lo muestre.

```ts
// PATRÓN (aplicar a cada una, ajustando la ruta de destino)
export async function validateItineraryStepAction(taskId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "COORDINATOR" && user.role !== "ADMIN") {
    throw new Error("No autorizado");
  }

  try {
    await validateItineraryStep(taskId, user.id, user.isDemo);
    revalidateItineraryPaths();
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const message = err instanceof Error ? err.message : "No se pudo validar el instrumento";
    redirect(`/coordinacion/casos?error=${encodeURIComponent(message)}`);
  }
}
```

Requiere `import { isNextRedirect } from "@/lib/next-errors";` y `import { redirect } from "next/navigation";` en `actions/itinerary.ts`.

**Del lado de la UI**: verificar que cada página destino renderice `searchParams.error`. `/coordinacion/casos` ya lo hace (recibe `?error=` de `transitionCaseStatusAction`); revisar y agregar el banner en `/coordinacion/sesiones` y `/coordinacion/alertas` si falta.

> Para las acciones que ya retornan objeto (`submitItineraryStepAction`, `logSessionAction`, `submitTaskAction`) **no cambiar nada**: sus componentes ya muestran `{ error }` en pantalla.

---

## F10 · Extraer el cálculo de KPIs a un service

**Problema**: ~250 líneas de lógica de indicadores viven dentro de [src/app/(admin)/admin/reportes/page.tsx](src/app/(admin)/admin/reportes/page.tsx). No se puede probar, ni reutilizar en `/admin`, ni versionar el cálculo que se congela como evidencia ante SENDA.

**Trabajo**:

1. Crear `src/server/services/reports.service.ts` con **una función pura**, sin acceso a Prisma:
```ts
export interface KpiInput {
  cases: CaseWithRelations[];      // PACase + per.user, candidate, iapRecords{domainMaps,goals}, sessionLogs, tasks{instrument}
  supervisions: Supervision[];
  activations: NetworkActivationWithDevice[];
}

export interface KpiResult {
  totalCasesCount: number;
  adherencePercent: number;          // KPI 1.1 — continuidad con ≥90 días
  generalAdherencePercent: number;
  newCasesPercent: number;           // KPI 1.2
  exAntePercent: number;             // KPI 2.1
  iapMonitoringPercent: number;      // KPI 2.2
  satisfactionPercent: number;       // KPI 2.3
  byStage: Record<string, number>;   // KPI 3
  trainingProgress: number;          // KPI 4
  documentaryCompliance: number;     // KPI 5
  intermediateEvaluationsCount: number;
  supervisionCount: number;
  networkDevices: NetworkSummary[];
  demographics: DemographicsBreakdown;
  domainStats: DomainStat[];
  duplasByGender: DuplaGenderBreakdown;
  csv: { general: string };
}

export function computeKpis(input: KpiInput): KpiResult { /* mover aquí la lógica tal cual */ }
```

2. `page.tsx` queda solo con: autenticación, resolución de `searchParams`, las consultas Prisma (con sus filtros `isDemo` y de fecha de corte intactos), la llamada a `computeKpis()` y el render.

3. **Mover el cálculo sin alterarlo**, salvo la corrección de `F04` que ya quedó aplicada. Este fix es refactor puro: los números antes y después deben ser idénticos.

**Verificación**: capturar los valores de `/admin/reportes` (demo, Nacional, período Actual) antes del refactor y comparar después. Cualquier diferencia es un error de traslado.

### Checkpoint Fase 3
```bash
npx tsc --noEmit && npx next lint
```
```bash
git add -A && git commit -m "refactor(reportes): extraer computeKpis a service y propagar errores de server actions a la UI"
```

---

# FASE 4 — Consistencia y soporte de pruebas (P3)

## F11 · Nomenclatura "Bitácora" → "Registro de Acompañamiento"

**Archivo**: [src/server/services/sessions.service.ts](src/server/services/sessions.service.ts) — líneas ~90, ~143, ~205.

| Antes | Después |
|---|---|
| `"Nueva Bitácora por Validar"` | `"Nuevo Registro de Acompañamiento por validar"` |
| `"Bitácora Validada"` | `"Registro de Acompañamiento validado"` |
| `"Bitácora Devuelta"` | `"Registro de Acompañamiento devuelto"` |

Y barrer el resto de la interfaz:
```bash
grep -rni "bitácora\|bitacora" src/ --include=*.ts --include=*.tsx
```
Reemplazar los textos **visibles al usuario**. Conservar el término en `/admin/auditoria` solo si se refiere a la bitácora de auditoría, que es otra cosa.

---

## F12 · Alinear la documentación con el modal demo

**Archivo**: [Manual.md](Manual.md) §14 — dice *«13 cuentas: 1 Administrador, los 5 Coordinadores Regionales y 8 acompañantes PER»*.

**Realidad** ([LoginForm.tsx:32](src/components/auth/LoginForm.tsx:32)): 16 cuentas — 1 Admin, 5 Coordinadores y **10 PER** (`per.carla`, `per.valpo`, `per.diego`, `per.juan`, `per.sonia`, `per.lucas`, `per.mario`, `per.camila`, `per.pedro`, `per.elena`).

**Acción**: corregir el Manual a 16 (el código es la fuente de verdad). Revisar de paso el mismo dato en [Guia.md](Guia.md) y [public/Resumen.md](public/Resumen.md).

---

## F13 · Permitir apuntar la SQLite local por variable de entorno

**Archivo**: [src/lib/db.ts:52](src/lib/db.ts:52)

**Problema**: la ruta local está fija en `file:dev.db`. Cualquier prueba automatizada escribe sobre la base de desarrollo. Es el prerrequisito de la batería descrita en [PruebasUnitarias.md](PruebasUnitarias.md).

**Cambio**:
```ts
// ANTES
const adapter = new PrismaBetterSqlite3({ url: "file:dev.db" });

// DESPUÉS
// LOCAL_SQLITE_URL permite apuntar a una base desechable en pruebas sin tocar dev.db.
// No usa DATABASE_URL a propósito: esa variable ya está reservada arriba para Turso.
const adapter = new PrismaBetterSqlite3({ url: process.env.LOCAL_SQLITE_URL || "file:dev.db" });
```

Documentar la variable en [.env.example](.env.example).

### Checkpoint Fase 4
```bash
npx tsc --noEmit && npx next lint
```
```bash
git add -A && git commit -m "chore: unificar nomenclatura de Registro de Acompanamiento, alinear docs y permitir LOCAL_SQLITE_URL"
```

---

# 2. Verificación final (humo manual)

Tras las 4 fases, resetear y recorrer:

```bash
npx prisma db push && npx prisma db seed && npm run dev
```

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Login real con `per.carla` | Error *«Esta es una cuenta de demostración…»* |
| 2 | Login real `coord.metro` → crear caso continuidad en Metropolitana | Código **`PA-MET-001`** (no `005`) |
| 3 | Login real `coord.losrios` → crear caso | Código `PA-LOS-001` |
| 4 | Admin demo → congelar Informe 3 → admin real → Informe 3 | El real muestra cálculo en vivo, no el congelado |
| 5 | `/admin/reportes` demo | Evaluaciones intermedias > 0 |
| 6 | Coordinador → habilitar un PER | Aparece `HABILITACION_PER` en `/admin/auditoria` |
| 7 | Marcar deserción con 0 intentos y motivo con la palabra "forzada" | **Rechazado** |
| 8 | Marcar deserción con 0 intentos + checkbox de forzado + motivo | Aceptado, con `FORCE_DESERTION` en auditoría |
| 9 | PER intenta `NO_APLICA` sobre su paso actual | No autorizado / control ausente en su UI |
| 10 | Validar un Registro de Acompañamiento | Notificación dice *«Registro de Acompañamiento validado»* |
| 11 | Recorrido completo del itinerario Vinculación (enviar → devolver → corregir → validar ×5) | Sin regresiones; el gate se satisface al final |

---

# 3. Fuera de alcance (no tocar sin consultar al usuario)

- **Renombrar códigos de caso ya emitidos.** Si `F03` encuentra casos `PA-RIO-###`, detenerse.
- **Aplicar la migración de `F02` contra Turso/producción.** El SQL queda escrito y probado en local; la aplicación remota la decide el usuario.
- **Reducir el modal demo de 16 a 13 cuentas.** `F12` corrige la documentación, no el código. Cambiar las cuentas alteraría los escenarios del [Guion.md](Guion.md).
- **Implementar la batería de pruebas.** Es un trabajo aparte, especificado en [PruebasUnitarias.md](PruebasUnitarias.md). `F13` solo habilita su prerrequisito.
- **Optimizar el N+1 de `assertStageAdvanceAllowed`** (una consulta por instrumento del gate). Funciona correctamente; es mejora de rendimiento, no corrección.

---

# 4. Orden de ejecución resumido

```
F03 → F02 → F01        (Fase 1, commit)
F04 → F05 → F06 → F07 → F08   (Fase 2, commit)
F09 → F10             (Fase 3, commit)
F11 → F12 → F13       (Fase 4, commit)
→ verificación de humo (§2)
```

`F03` va antes que `F02` porque ambos tocan la misma función. `F04` va antes que `F10` porque `F10` mueve ese código de lugar. El resto son independientes entre sí.
