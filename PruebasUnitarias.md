# 🧪 Estructura de Pruebas — Plataforma de Coordinación PER 2026-2027

**Versión**: 1.0 — Agosto 2026
**Propósito doble**:
1. **Red de seguridad técnica**: verificar que las reglas metodológicas del convenio (itinerario secuencial, puertas de avance, bloqueo de egreso, aislamiento demo/real, filtro regional) están efectivamente implementadas y no se rompen con cambios futuros.
2. **Respaldo del video demostrativo**: cada prueba lleva un ID (`ITIN-03`, `CASE-09`, …) que aparece en [Guion.md](Guion.md). Si una prueba falla, se sabe exactamente qué escena del video dejó de ser cierta.

> **Estado actual del repositorio**: no hay framework de pruebas instalado ([package.json](package.json)). Este documento define la estructura completa a construir: dependencias, configuración, helpers, árbol de archivos y el catálogo íntegro de casos de prueba con su Arrange–Act–Assert. Las secciones §1–§4 son ejecutables tal cual; §5 es el catálogo a implementar.

---

## 1. Estrategia: tres niveles

La aplicación es Next.js App Router con Prisma. Casi toda la lógica crítica vive en *server actions* y *services* que tocan la base de datos, así que una batería puramente unitaria (con todo mockeado) probaría muy poco de lo que importa. Por eso se organiza en tres niveles con proporciones deliberadas:

| Nivel | Qué prueba | Aislamiento | Velocidad | Peso |
|---|---|---|---|---|
| **L1 — Unitarias puras** | Funciones sin efectos: catálogo del itinerario, nomenclaturas, extracción de IDs de Drive, firma de sesión | Ninguna dependencia externa | ~ms | 25% |
| **L2 — Servicios contra SQLite** | Services y server actions contra una base SQLite real y desechable | BD propia por archivo de prueba; Google Workspace mockeado | ~decenas de ms | 60% |
| **L3 — Componentes** | Componentes cliente: tablero de itinerario, formularios, borradores offline | jsdom + Testing Library; server actions mockeadas | ~ms | 15% |

**Por qué L2 pesa más**: las reglas que el video promete —«el siguiente paso no existe hasta validar el actual», «no se puede egresar sin la encuesta», «un coordinador no ve otra región»— son invariantes **transaccionales**. Mockear Prisma para probarlas sería probar el mock. Con SQLite en archivo temporal, cada prueba corre contra el esquema real en milisegundos.

---

## 2. Dependencias a instalar

```bash
npm i -D vitest @vitest/coverage-v8 @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

| Paquete | Rol |
|---|---|
| `vitest` | Runner. Nativo TS/ESM, sin configuración de Babel, compatible con los alias `@/` del proyecto |
| `@vitest/coverage-v8` | Cobertura |
| `vite-tsconfig-paths` | Resuelve `@/*` desde [tsconfig.json](tsconfig.json) sin duplicar el mapeo |
| `@vitejs/plugin-react` + `jsdom` + Testing Library | Nivel L3 |

---

## 3. Configuración

### 3.1 `vitest.config.ts` (raíz)

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        // L1 + L2: services, actions, lib
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/{unit,services,actions}/**/*.test.ts"],
          setupFiles: ["tests/setup/server.setup.ts"],
          // Cada archivo con su propia BD => sin colisiones entre workers
          isolate: true,
          fileParallelism: true,
        },
      },
      {
        // L3: componentes cliente
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/lib/**", "src/server/services/**", "src/app/actions/**", "src/components/**"],
      thresholds: {
        // Umbrales realistas para el primer hito; subir progresivamente
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
```

### 3.2 Aislamiento de base de datos — el punto delicado

[src/lib/db.ts](src/lib/db.ts:52) tiene la ruta SQLite **fija**: `new PrismaBetterSqlite3({ url: "file:dev.db" })`. No hay variable de entorno para cambiarla en local, así que **las pruebas no deben depender de ese fallback**: escribirían sobre la base de desarrollo.

La salida limpia aprovecha que `db.ts` exporta `globalForPrisma.prisma || <proxy>`: si el setup file define `globalThis.prisma` **antes** de que cualquier módulo importe `@/lib/db`, todos los services usan ese cliente. Vitest ejecuta los `setupFiles` antes de importar los módulos de prueba, así que la sustitución es fiable.

`tests/setup/server.setup.ts`:

```ts
import { beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDatabase } from "../helpers/db";

const dir = mkdtempSync(join(tmpdir(), "per-test-"));
const dbFile = join(dir, "test.db");

// Esquema real aplicado a la BD desechable
execSync(`npx prisma db push --skip-generate`, {
  env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
  stdio: "ignore",
});

const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbFile}` }) });

// Sustitución ANTES de que los módulos bajo prueba importen @/lib/db
(globalThis as any).prisma = client;

// Sesión firmada determinista
process.env.AUTH_SESSION_SECRET = "test-session-secret-at-least-32-chars-long";
process.env.REAL_MODE_PASSWORD = "P455w0rd!";
// Sin GOOGLE_APPS_SCRIPT_URL => workspace.ts usa su simulación local

beforeEach(async () => { await resetDatabase(client); });
afterAll(async () => { await client.$disconnect(); rmSync(dir, { recursive: true, force: true }); });
```

> **Mejora opcional recomendada** (una línea en producción, mucho menos frágil en pruebas): permitir sobreescribir la ruta local en `db.ts` con `new PrismaBetterSqlite3({ url: process.env.LOCAL_SQLITE_URL ?? "file:dev.db" })`. Con eso el setup se reduce a exportar una variable de entorno y desaparece el truco del `globalThis`.

### 3.3 `tests/setup/dom.setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => { cleanup(); localStorage.clear(); });

// navigator.onLine controlable desde cada prueba
Object.defineProperty(navigator, "onLine", { writable: true, value: true });

// next/navigation y server actions no existen en jsdom
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
}));
```

### 3.4 Scripts a agregar en `package.json`

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:server": "vitest run --project server",
    "test:components": "vitest run --project components",
    "test:coverage": "vitest run --coverage",
    "test:guion": "vitest run --reporter=verbose"
  }
}
```

`test:guion` produce la salida con el nombre completo de cada prueba —que incluye su ID `E##`— y es la que conviene grabar en pantalla si el video incluye una escena de verificación técnica.

---

## 4. Helpers y fábricas

### 4.1 `tests/helpers/db.ts`

```ts
import type { PrismaClient } from "@prisma/client";

// Orden inverso de dependencias, idéntico al de prisma/seed.ts
const TABLES_IN_ORDER = [
  "setting", "auditLog", "pushSubscription", "calendarEventRef", "driveFileRef",
  "alert", "feedback", "supervision", "sessionLog", "iAPGoal", "iAPDomainMap",
  "iAPRecord", "taskEvent", "task", "caseStatusHistory", "caseStageHistory",
  "documentRecord", "networkActivation", "networkDevice", "phase5Record",
  "reportSnapshot", "contactAttempt", "pACase", "pACandidate", "trainingRecord",
  "pERProfile", "instrument", "user",
] as const;

export async function resetDatabase(db: PrismaClient) {
  for (const t of TABLES_IN_ORDER) await (db as any)[t].deleteMany();
}
```

### 4.2 `tests/helpers/factories.ts`

Fábricas mínimas y componibles. **No** reutilizar `prisma/seed.ts`: ese seed construye un escenario grande y aleatorio; las pruebas necesitan escenarios chicos y deterministas.

```ts
export async function makeAdmin(db, over = {}) { /* User role ADMIN */ }
export async function makeCoordinator(db, { regionId = "Metropolitana", ...over } = {}) { }
export async function makePer(db, { regionId, certificationStatus = "HABILITADO", coordinatorId }) {
  // devuelve { user, profile }
}
export async function makeCandidate(db, { regionId, status = "ADMISIBLE", isDemo = true }) { }

/** Instala en la BD los 16 Instrument del catálogo oficial (prisma/catalog/instruments.ts).
 *  Requisito de casi toda prueba L2: ensureCurrentStageTasks() falla sin instrumentos VIGENTE. */
export async function seedInstruments(db, createdByUserId) { }

/** Caso ya formalizado en la etapa indicada, con IAPRecord y el primer paso materializado. */
export async function makeCase(db, { per, coordinator, stage = "VINCULACION", isDemo = true, type = "NUEVO" }) { }

/** Avanza el itinerario N pasos validados usando los servicios REALES
 *  (mismo enfoque que seedAdvanceItinerary en prisma/seed.ts):
 *  nunca reimplementar reglas de estado dentro de las fábricas. */
export async function advanceItinerary(db, caseId, actorId, validatedCount, finalState?) { }
```

### 4.3 `tests/helpers/session.ts`

Las server actions llaman a `getCurrentUser()`, que lee la cookie vía `next/headers`. Se mockea el módulo completo:

```ts
import { vi } from "vitest";

export function mockSession(user: Partial<SessionUser> | null) {
  vi.doMock("@/lib/auth", async (orig) => ({
    ...(await orig<typeof import("@/lib/auth")>()),
    getCurrentUser: vi.fn().mockResolvedValue(user),
    requireUser: vi.fn(async (roles) => {
      if (!user) throw new Error("No autenticado");
      if (roles && !roles.includes(user.role)) throw new Error("No autorizado");
      return user;
    }),
  }));
}
```

Para probar `login()` / `getCurrentUser()` **de verdad** (grupo `AUTH`), en su lugar se mockea `next/headers` con un almacén de cookies en memoria.

### 4.4 `tests/helpers/workspace.ts`

`@/server/google/workspace` importa `server-only` y, sin `GOOGLE_APPS_SCRIPT_URL`, simula. Aun así conviene mockearlo explícitamente para poder **forzar fallos** y verificar los rollbacks:

```ts
export function mockWorkspace({ failOn }: { failOn?: "iap" | "acta" | "folder" } = {}) { }
```

### 4.5 Convención de nombres

```
describe("<módulo>", () => {
  it("[ITIN-03] devuelve el paso con observación y lo deja editable para el PER", ...)
})
```

El ID entre corchetes al inicio permite `vitest -t "ITIN-03"` para ejecutar exactamente la prueba que respalda una escena del video.

---

## 5. Árbol de archivos y catálogo de pruebas

```
tests/
├── setup/
│   ├── server.setup.ts
│   └── dom.setup.ts
├── helpers/
│   ├── db.ts · factories.ts · session.ts · workspace.ts
├── unit/                      # L1 — puras
│   ├── instrument-itinerary.test.ts
│   ├── nomenclatures.test.ts
│   ├── google-resource.test.ts
│   └── auth-session.test.ts
├── services/                  # L2 — services contra SQLite
│   ├── itinerary.service.test.ts
│   ├── tasks.service.test.ts
│   ├── cases.service.test.ts
│   ├── sessions.service.test.ts
│   ├── alerts.service.test.ts
│   ├── instruments.service.test.ts
│   └── push.service.test.ts
├── actions/                   # L2 — server actions (autorización + efectos)
│   ├── auth.action.test.ts
│   ├── admin.action.test.ts
│   ├── coordinator.action.test.ts
│   ├── itinerary.action.test.ts
│   └── per.action.test.ts
├── reports/
│   └── kpis.test.ts
└── components/                # L3 — jsdom
    ├── StageItineraryBoard.test.tsx
    ├── NativeInstrumentForm.test.tsx
    ├── RegistroAcompanamientoForm.test.tsx
    ├── ItineraryValidationPanel.test.tsx
    ├── LoginForm.test.tsx
    └── AppShell.test.tsx
```

---

### 5.1 `tests/unit/instrument-itinerary.test.ts` — L1

Catálogo del itinerario ([src/lib/instrument-itinerary.ts](src/lib/instrument-itinerary.ts)). Barato y de altísimo valor: congela la definición metodológica del IAP.

| ID | Caso | Aserción |
|---|---|---|
| `CAT-01` | Vinculación tiene 5 pasos secuenciales en el orden oficial | `getSequentialStepsForStage("VINCULACION").map(s => s.activityKey)` = `[PRIMER_ENCUENTRO_REFLEXION, ACTIVIDAD_1_MOTIVACIONES, ACTIVIDAD_2_ANTECEDENTES, ACTIVIDAD_3_MAPA_RECURSOS, ACTIVIDAD_4_PLANIFICACION]` |
| `CAT-02` | Conexión: el Registro de Acompañamiento es continuo, no secuencial | `REGISTRO_ACOMPANAMIENTO.triggerCondition === "CONTINUOUS"` y **no** aparece en `getSequentialStepsForStage("CONEXION")` |
| `CAT-03` | Los formularios de abandono son condicionales y no cuentan para el gate | ambos: `triggerCondition === "ON_WITHDRAWAL"` y `countsTowardStageGate === false` |
| `CAT-04` | El gate de Finalización exige exactamente 3 instrumentos | pasos con `countsTowardStageGate` en FINALIZACION = `[ACTIVIDAD_5_FINAL, ACTIVIDAD_6_REFLEXION_FINAL, ENCUESTA_SATISFACCION]` |
| `CAT-05` | Actividad 2 agrupa 13 preguntas en 5 secciones | `new Set(fields.filter(f => f.section).map(f => f.section)).size === 5`; el campo `alias` es el primero de *«1. Presentación y contexto»* y `required === false` |
| `CAT-06` | Actividad 5 (Intermedia y Final) comparten las 7 preguntas de evaluación | ambos pasos referencian el mismo conjunto de `key`s |
| `CAT-07` | Los 9 ámbitos de recuperación son los oficiales | `RECOVERY_DOMAINS.length === 9` y contenido exacto |
| `CAT-08` | Todo `activityKey` es único en el catálogo | sin duplicados |
| `CAT-09` | `getStepByActivityKey` devuelve `undefined` para clave desconocida | no lanza |
| `CAT-10` | Reformular Actividad 4 es opcional pero cuenta para el gate | `optional === true && countsTowardStageGate === true` |

---

### 5.2 `tests/unit/nomenclatures.test.ts` — L1 · Escenas E15, E18

| ID | Caso | Aserción |
|---|---|---|
| `NOM-01` | Etiquetas de etapa | `mapStageToLabel("VINCULACION") === "Vinculación"`, etc. |
| `NOM-02` | `formatCaseLabel` con alias | `("PA-MET-001", "Fer") → "PA-MET-001 (Fer)"` |
| `NOM-03` | `formatCaseLabel` sin alias / alias vacío / solo espacios | devuelve el código pelado en los tres casos |
| `NOM-04` | Estados de caso → etiqueta oficial | `EGRESO → "Egreso"`, `RETIRO_VOLUNTARIO → "Retiro voluntario"`, activos → `"Al día"` |
| `NOM-05` | Tipos de alerta → nombre institucional | `INSTRUMENTO_PENDIENTE_VALIDACION → "Alerta de validación pendiente"`, `CASO_ETAPA_ESTANCADA → "Alerta de itinerario estancado"` |
| `NOM-06` | Emociones | `BIEN → "😊 Bien"`; `ENOJADO` y `MOLESTO` mapean ambos a *Molesto* |
| `NOM-07` | Tipo de alerta desconocido | fallback a *Title Case* sin lanzar |

---

### 5.3 `tests/unit/google-resource.test.ts` + `auth-session.test.ts` — L1

| ID | Caso | Aserción |
|---|---|---|
| `GRES-01` | Extrae el ID desde una URL `/file/d/<id>/view` | ID correcto |
| `GRES-02` | Extrae el ID desde `?id=<id>` y desde un ID pelado | ID correcto |
| `GRES-03` | Entrada basura | devuelve `null`/vacío, no lanza |
| `AUTH-07` | La cookie de sesión va firmada con HMAC | `decodeSession` acepta el valor emitido por `encodeSession` |
| `AUTH-08` | Firma manipulada se rechaza | alterar un byte del payload → `getCurrentUser()` devuelve `null` |
| `AUTH-09` | `verifyRealModePassword` compara en tiempo constante y rechaza vacío/incorrecta | `false` para `""`, `undefined`, contraseña errónea; `true` para la correcta |
| `AUTH-10` | En producción sin `AUTH_SESSION_SECRET` (≥32) se lanza error | `sessionSecret()` lanza |

---

### 5.4 `tests/actions/auth.action.test.ts` — L2 · Escenas **E02, E03**

Con `next/headers` mockeado sobre un almacén de cookies en memoria.

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `AUTH-01` | Usuario sin `@` resuelve el dominio institucional | E02 | `login("coord.metro", pass)` encuentra `coord.metro@per2026.cl` |
| `AUTH-02` | Usuario inexistente o inactivo | E02 | `{ error: "email_not_found" }`; idem con `active: false` |
| `AUTH-03` | Cuenta `isDemo: true` por el formulario real | E03 | `{ error: "account_is_demo_only" }` y **no** se emite cookie |
| `AUTH-04` | Contraseña incorrecta en modo real | E03 | `{ error: "invalid_password" }` |
| `AUTH-05` | Acceso demo con cuenta fuera de `DEMO_EMAILS` | E03 | `{ error: "demo_not_allowed" }` |
| `AUTH-06` | **El modo lo define el método de login, no la cuenta** | E03 | `login("admin", undefined, true)` → sesión con `isDemo: true`; `login("admin", pass, false)` → `isDemo: false`. Cuenta idéntica, modos distintos |
| `AUTH-11` | El acceso demo no exige contraseña | E03 | `login(demoUser, undefined, true)` tiene éxito |
| `AUTH-12` | `getCurrentUser` revalida contra la BD | — | desactivar al usuario tras el login → devuelve `null` aunque la cookie siga siendo válida |
| `AUTH-13` | `requireUser(["ADMIN"])` con rol PER | — | lanza *No autorizado* |

---

### 5.5 `tests/services/itinerary.service.test.ts` — L2 · **Núcleo del sistema**

El archivo más importante de la batería. Escenas E09, E16–E20, E23, E25–E27.

| ID | Caso | Escena | Arrange → Act → Assert |
|---|---|---|---|
| `ITIN-01` | Solo se materializa **un** paso a la vez | E16 | Caso nuevo en Vinculación → `ensureCurrentStageTasks()` → existe exactamente **1** `Task` en el caso, la de `PRIMER_ENCUENTRO_REFLEXION` |
| `ITIN-02` | El estado del tablero clasifica en COMPLETED / CURRENT / UPCOMING | E16 | 2 pasos validados + 1 enviado → `getItineraryState()` devuelve 2 COMPLETED, 1 CURRENT, 2 UPCOMING, y los UPCOMING **no tienen `taskId`** |
| `ITIN-03` | Devolver deja el paso editable y conserva el contenido | E17 | Enviar con payload → `returnItineraryStep(note)` → estado `DEVUELTA`, `contentJson` intacto, se crea `Feedback` con `requiresCorrection: true` |
| `ITIN-04` | Validar desbloquea el siguiente paso, y solo el siguiente | E17 | Validar el paso 1 → aparece la Task del paso 2; el paso 3 sigue sin existir |
| `ITIN-05` | El orden lo manda el catálogo, no el código | E09 | Alterar el `order` del instrumento en BD → `ensureCurrentStageTasks` materializa el que quedó primero |
| `ITIN-06` | `ensureCurrentStageTasks` es idempotente | E17 | Llamarla 3 veces seguidas → sigue habiendo 1 sola Task; no duplica `TaskEvent` de creación |
| `ITIN-07` | El alias de la Actividad 2 se persiste en el caso | E18 | `submitItineraryStep` con `alias: "Fer"` → `PACase.alias === "Fer"` |
| `ITIN-08` | Alias vacío o con solo espacios no sobreescribe | E18 | `alias: "   "` → `PACase.alias` queda como estaba (`null`) |
| `ITIN-09` | Actividad 3 escribe en `IAPDomainMap`, no en `contentJson` | E19 | Enviar 9 filas → 9 `IAPDomainMap` ligados a esa Task |
| `ITIN-10` | Reenviar Actividad 3 reemplaza, no acumula | E19 | Enviar 9 filas, devolver, reenviar 9 → siguen siendo 9, no 18 |
| `ITIN-11` | Actividad 4 crea objetivos `version: 1, isCurrent: true` | E19 | 2 objetivos → 2 `IAPGoal` vigentes v1 |
| `ITIN-12` | Reformular Actividad 4 versiona y desactiva la versión previa | E20 | Enviar `REFORMULAR_ACTIVIDAD_4` → los objetivos v1 quedan `isCurrent: false`; los nuevos son v2 vigentes; `getCurrentGoalsForCase()` devuelve solo los v2 |
| `ITIN-13` | El gate bloquea con la lista exacta de faltantes | E23 | Etapa con 2 de 5 validados → `assertStageAdvanceAllowed()` → `satisfied: false` y `missing` con los 3 `activityKey` correctos |
| `ITIN-14` | El gate se satisface con la etapa completa | E23 | 5 de 5 validados → `satisfied: true, missing: []` |
| `ITIN-15` | Un paso `NO_APLICA` cuenta como resuelto para el gate | E23 | Marcar uno como `NO_APLICA` → deja de aparecer en `missing` y se desbloquea el siguiente |
| `ITIN-16` | El gate de Finalización exige los 3 instrumentos del egreso | E26 | Con la Encuesta de Satisfacción pendiente → `missing` la incluye |
| `ITIN-17` | El formulario de abandono se materializa fuera de la etapa | E27 | Caso en **Vinculación** → `ensureWithdrawalStep(caseId, "PA")` → la Task existe y aparece en `pendingWithdrawalStep` |
| `ITIN-18` | `ensureWithdrawalStep` es idempotente | E27 | Dos llamadas → una sola Task |
| `ITIN-19` | Campo obligatorio faltante rechaza el envío | E17 | `submitItineraryStep` sin `reflection` → lanza *«El campo … es obligatorio»* y la Task **no** cambia de estado |
| `ITIN-20` | **Aislamiento demo/real** | — | Caso `isDemo: true` operado con `isDemo: false` → lanza *«El caso no pertenece al modo de trabajo actual»* en `ensureCurrentStageTasks`, `getItineraryState`, `submitItineraryStep` y `assertStageAdvanceAllowed` |
| `ITIN-21` | Sin instrumento `VIGENTE` para la clave | — | Instrumento en `ARCHIVADO` → lanza *«No se encontró el instrumento vigente para …»* |

---

### 5.6 `tests/services/tasks.service.test.ts` — L2 · Escenas E17, E25, E29

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `TASK-01` | Cada cambio de estado deja `TaskEvent` + `AuditLog` | E17 | Tras `PENDIENTE → ENVIADA → VALIDADA`: 2 `TaskEvent` con `fromStatus`/`toStatus` correctos y 2 entradas `UPDATE_TASK_STATUS` |
| `TASK-02` | Devolver genera `Feedback` dirigido al PER asignado | E17 | `Feedback.perId === task.assignedToUserId`, `requiresCorrection: true` |
| `TASK-03` | Validar la Encuesta de Satisfacción marca `satisfactionTaskId` en el caso | E25 | Es el campo que consume el KPI 2.3 |
| `TASK-04` | No se asigna tarea crítica a un PER no habilitado | E29 | `assignTask` con instrumento `criticalTask: true` y PER `PENDIENTE` → lanza |
| `TASK-05` | Validar Actividad 5 Final marca `exPostTaskId`; Actividad 4 marca `exAnteTaskId` | E10 | Alimenta los KPIs 2.1 y 2.2 |
| `TASK-06` | Un PER no puede mover una tarea que no le pertenece | — | Actor PER ≠ `assignedToUserId` → lanza *«La tarea no está asignada al PER autenticado»* |
| `TASK-07` | Un coordinador no puede operar tareas de otra región | E12 | Actor COORDINATOR con `regionId` distinto → lanza |
| `TASK-08` | Instrumento nativo no exige archivo de Drive | E17 | `NATIVE_FORM` pasa a `ENVIADA` sin `googleFileId`; `EXTERNAL_LINK` en modo real sí lo exige |
| `TASK-09` | Aislamiento demo/real en tareas | — | `isDemo` cruzado → lanza |

---

### 5.7 `tests/services/cases.service.test.ts` — L2 · Escenas E12–E14, E23–E28

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `CASE-01` | Un coordinador no crea casos de otra región | E12 | `createCaseFromCandidate` con candidata de otra región → lanza *«No autorizado para operar casos de esta región»* |
| `CASE-02` | El ADMIN sí puede operar cualquier región | E12 | Mismo escenario con rol ADMIN → tiene éxito |
| `CASE-03` | No se asigna caso a PER no habilitado | E14 | PER `NO_HABILITADO` → lanza |
| `CASE-04` | El código correlativo se genera por región y es único | E14 | Primer caso de Metropolitana → `PA-MET-001`; el siguiente → `PA-MET-002` |
| `CASE-05` | El correlativo **ignora `isDemo`** al contar | E14 | Con casos demo existentes, el primer caso real no colisiona (regresión conocida: ver comentario en [cases.service.ts:29](src/server/services/cases.service.ts:29)) |
| `CASE-06` | Crear el caso cambia la candidata a `SELECCIONADA` y la enlaza | E14 | `convertedToCaseId` apunta al caso; se registra `CREATE_CASE` en auditoría y se notifica al PER |
| `CASE-07` | Formalizar exige match `VALIDADO` | E14 | `formalizeMatch` sobre un match `PROPUESTO` → lanza |
| `CASE-08` | Formalizar aprovisiona Drive + IAP y pasa a Vinculación | E14 | Se crean las 4 subcarpetas, `IAPRecord` con `driveDocId`, `stage: VINCULACION` y la primera Task del itinerario |
| `CASE-09` | **Rollback**: si falla la copia del Acta, no queda nada a medias | E14 | `mockWorkspace({ failOn: "acta" })` → se llama al rollback de IAP y carpeta, y el caso **no** queda formalizado |
| `CASE-10` | Avanzar de etapa con instrumentos pendientes está bloqueado | E23 | `transitionCaseStatus(→ CONEXION)` sin gate satisfecho y sin forzar → lanza con la lista de faltantes en el mensaje |
| `CASE-11` | Forzar sin motivo está prohibido; con motivo queda auditado | E24 | `forceAdvance: true, reason: ""` → lanza. Con motivo → transición aplicada + `AuditLog` `FORCE_STAGE_ADVANCE` con `reason` y los `activityKey` omitidos |
| `CASE-12` | **No se egresa sin la Encuesta de Satisfacción validada** | E26 | Finalización con la encuesta pendiente → `→ EGRESO` lanza. Validándola → tiene éxito |
| `CASE-13` | Retiro voluntario exige el Formulario de Abandono **validado** | E27 | Sin la Task, o con la Task en `ENVIADA` → lanza. Con `VALIDADA` → tiene éxito |
| `CASE-14` | El retiro registra la liberación de cupo | E27 | `AuditLog` `CASE_WITHDRAWAL_NOTIFICATION` con la lista de preselección regional |
| `CASE-15` | Deserción exige ≥ 3 intentos de contacto | E28 | Con 2 intentos → lanza. Con 3 → tiene éxito |
| `CASE-16` | Cambiar de etapa cierra el historial anterior y abre el nuevo | E23 | El `CaseStageHistory` previo recibe `exitedAt`; se crea uno nuevo con `enteredAt` |
| `CASE-17` | Al entrar a una etapa nueva se materializa su primer paso | E23 | Tras `→ CONEXION`, existe la Task de `ACTIVIDAD_5_INTERMEDIA` y **ninguna** otra de esa etapa |
| `CASE-18` | La transición notifica a coordinación y al PER | E23 | 2 notificaciones con enlace profundo al caso |

---

### 5.8 `tests/services/sessions.service.test.ts` — L2 · Escenas E20–E21, E33

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `SESS-01` | El número de sesión se autoasigna correlativo | E20 | Con 7 registros previos, el nuevo es `sessionNumber: 8` |
| `SESS-02` | El registro se liga a un `IAPGoal` vigente | E20 | `iapGoalId` persistido; `getCurrentGoalsForCase()` solo ofrece objetivos `isCurrent: true` |
| `SESS-03` | Solo el PER dueño del caso puede registrar | E20 | Otro PER → lanza *«El caso no está asignado al PER autenticado»* |
| `SESS-04` | Validar actualiza `lastSessionDate` del caso | E21 | Solo si `attendance === "REALIZADA"` y la fecha es posterior a la registrada |
| `SESS-05` | Validar no retrocede `lastSessionDate` | E21 | Validar un registro **anterior** al último no modifica el campo |
| `SESS-06` | Devolver crea `Feedback`, deja `DEVUELTA` y notifica al PER | E21 | `coordinatorFeedbackId` enlazado |
| `SESS-07` | **Sincronización offline idempotente** | E33 | Dos `logSession` con el mismo `offlineDraftId` → un solo `SessionLog`; el segundo devuelve el existente |
| `SESS-08` | Enviar notifica a la coordinación del caso | E21 | Notificación con enlace a `/coordinacion/sesiones?highlightSessionId=…` |
| `SESS-09` | Aislamiento demo/real | — | `isDemo` cruzado → lanza en `logSession`, `validateSession` y `returnSession` |

---

### 5.9 `tests/services/alerts.service.test.ts` — L2 · Escena E32

Todas con reloj congelado (`vi.setSystemTime`) para que los umbrales sean deterministas.

| ID | Regla | Aserción |
|---|---|---|
| `ALRT-01` | Caso sin sesiones supera el umbral | Caso en Conexión con `lastSessionDate` a 15 días → alerta `CASO_SIN_SESION`; a 13 días → ninguna |
| `ALRT-02` | Umbral por etapa configurable | Cambiar `alert_days_conexion` en `Setting` a 20 → el caso de 15 días deja de alertar |
| `ALRT-03` | No duplica alertas abiertas | Ejecutar `checkAllAlertRules` dos veces → una sola alerta |
| `ALRT-04` | Tarea vencida pasa a `ATRASADA` y genera alerta documental | Se crea además el `TaskEvent` con `byUserId: "SYSTEM"` |
| `ALRT-05` | PER no habilitado con tarea crítica | Alerta `PER_NO_HABILITADO` severidad `CRITICA` |
| `ALRT-06` | Instrumento enviado sin revisar > 5 días | Alerta `INSTRUMENTO_PENDIENTE_VALIDACION` (la regla que audita a la propia coordinación) |
| `ALRT-07` | Etapa estancada con el paso actual aún `PENDIENTE` | Alerta `CASO_ETAPA_ESTANCADA`; si el paso ya está `ENVIADA`, **no** se genera |
| `ALRT-08` | Resolver una alerta la cierra y la audita | Estado `RESUELTA`, `resolutionNote` guardada, `AuditLog` `RESOLVE_ALERT` |
| `ALRT-09` | Las reglas respetan `isDemo` | Ejecutar con `isDemo: false` no toca los casos demo |

---

### 5.10 `tests/actions/admin.action.test.ts` — L2 · Escenas E06, E07, E11

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `ADMN-01` | Crear PER genera correo institucional y perfil | E06 | `per.rosa` → `per.rosa@per2026.cl` + `PERProfile` en la región indicada |
| `ADMN-02` | Crear PER queda auditado | E06 | `AuditLog` `CREACION_USUARIO_PER` |
| `ADMN-03` | Editar con contraseña incorrecta no cambia nada | E07 | Redirige con `error=invalid_admin_password` y el usuario queda idéntico |
| `ADMN-04` | Editar con contraseña correcta actualiza y audita | E07 | `EDICION_USUARIO_PER` con `previousValue` y `newValue` |
| `ADMN-05` | **No se elimina un PER con casos asociados** | E07 | Redirige con `error=per_has_cases`; el usuario sigue existiendo |
| `ADMN-06` | Eliminar un PER sin casos, con contraseña correcta | E07 | Usuario borrado + `ELIMINACION_USUARIO_PER` |
| `ADMN-07` | La cuenta `admin@per2026.cl` no se puede desactivar | E07 | `error=cannot_deactivate_admin` |
| `ADMN-08` | Usuario duplicado | E06 | `error=user_exists` |
| `ADMN-09` | Todas las acciones exigen rol ADMIN | E06 | Con rol COORDINATOR → lanza *No autorizado* |
| `ADMN-10` | Un usuario desactivado no puede iniciar sesión | E07 | Encadena con `AUTH-02` |

---

### 5.11 `tests/services/instruments.service.test.ts` — L2 · Escenas E08, E09

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `INST-01` | El catálogo instala los 16 instrumentos con sus banderas | E08 | `mandatory`, `blocksProgress`, `validationRequired` y `status` según el catálogo oficial |
| `INST-02` | `updateInstrumentPlacement` cambia etapa y orden | E09 | Persistidos en el `Instrument` |
| `INST-03` | El cambio de ubicación queda auditado | E09 | `AuditLog` con valores previo y nuevo |
| `INST-04` | Sacar un instrumento del itinerario (`stageId: null`) | E09 | Deja de aparecer en el gate de su etapa anterior |

---

### 5.12 `tests/reports/kpis.test.ts` — L2 · Escena E10

Extraer el cálculo de KPIs de [`/admin/reportes/page.tsx`](src/app/(admin)/admin/reportes/page.tsx) a una función pura `computeKpis(cases, supervisions, activations)` en `src/server/services/reports.service.ts` y probar **esa** función. Hoy la lógica está embebida en el componente de página y es intestable.

| ID | KPI | Aserción |
|---|---|---|
| `RPT-01` | Conteos base | Totales, activos y cerrados por región |
| `RPT-02` | KPI 1.1 — adherencia ≥ 3 meses | Solo casos `CONTINUIDAD` con `lastSessionDate - startDate ≥ 90 días`; división por cero → 0% |
| `RPT-03` | KPI 1.2 — proporción de casos nuevos | `NUEVO / total` |
| `RPT-04` | KPI 2.3 — satisfacción en casos cerrados | Solo cuenta casos con `satisfactionTaskId` sobre los cerrados (`EGRESO`, `RETIRO_VOLUNTARIO`, `DESERCION`) |
| `RPT-05` | Corte "as-of" | Con fecha de corte del Informe 3, los casos creados después quedan excluidos |
| `RPT-06` | Congelar snapshot es reemplazable e inmutable | Congelar dos veces el mismo período/región deja **un** `ReportSnapshot`; su `kpisJson` no cambia aunque cambien los datos posteriormente |
| `RPT-07` | Congelar notifica a admins y coordinadores de la región | N notificaciones creadas |
| `RPT-08` | Solo ADMIN puede congelar | Rol COORDINATOR → lanza |
| `RPT-09` | Los KPIs respetan `isDemo` | Sesión real no ve datos demo y viceversa |

---

### 5.13 `tests/actions/coordinator.action.test.ts` — L2 · Escenas E29–E31

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `SUP-01` | Habilitar un PER actualiza estado, certificador y fecha | E29 | `certificationStatus: HABILITADO`, `certifiedByUserId`, `certifiedAt` |
| `SUP-02` | Suspender limpia `certifiedAt` | E29 | `certifiedAt: null` |
| `SUP-03` | Registrar supervisión crea el evento de Calendar y notifica al PER | E30 | `calendarEventId` guardado + notificación + `AuditLog` `SCHEDULE_SUPERVISION` |
| `SUP-04` | **Rollback**: si falla la escritura en BD, se revierte el evento de Calendar | E30 | Se llama `rollbackSupervisionEvent` y no queda `Supervision` |
| `SUP-05` | Fecha o duración inválida | E30 | Lanza antes de tocar Calendar |
| `NET-01` | Registrar dispositivo territorial en la región del coordinador | E31 | `regionId` tomado de la sesión, no del formulario |
| `NET-02` | Una activación de red no puede cruzar región ni modo | E31 | Caso de otra región o `isDemo` distinto → lanza |
| `NET-03` | Registrar actividad de Fase 5 | E31 | Persistida con tipo, fecha, participantes y URL |
| `CAND-01` | Crear candidata la deja en la región de la sesión y con el `isDemo` de la sesión | E13 | Sin fuga entre modos |
| `NOTIF-01` | Toda notificación creada lleva enlace profundo | E22 | `link` apunta a la vista exacta del recurso |
| `NOTIF-02` | El envío push no bloquea la transacción | E22 | Falla del push → la notificación en BD igual se crea (se despacha con `setImmediate`) |

---

### 5.14 `tests/actions/itinerary.action.test.ts` y `per.action.test.ts` — L2 · Escenas E17, E20, E33

| ID | Caso | Escena | Aserción |
|---|---|---|---|
| `ACT-01` | `submitItineraryStepAction` exige rol PER | E17 | COORDINATOR → `{ error: "No autorizado" }` |
| `ACT-02` | `validateItineraryStepAction` exige COORDINATOR o ADMIN | E17 | PER → lanza |
| `ACT-03` | `returnItineraryStepAction` sin observación no hace nada | E17 | Sin `feedback` → la Task no cambia de estado |
| `OFFL-01` | `syncOfflineItineraryStepsAction` sincroniza en lote y reporta errores parciales | E33 | 3 borradores, 1 con Task inválida → `syncedCount: 2` y `errors.length: 1` |
| `OFFL-02` | `syncOfflineSessionsAction` no duplica por `offlineDraftId` | E33 | Reintento del mismo lote → sin duplicados (encadena con `SESS-07`) |
| `OFFL-03` | Sincronizar con sesión expirada | E33 | `{ error: "No autorizado. Su sesión puede haber expirado." }` sin escribir nada |
| `PUSH-01` | Suscribir un dispositivo persiste el `PushSubscription` | E34 | Endpoint + claves guardados y ligados al usuario |
| `PUSH-02` | Una suscripción caducada no rompe el flujo | E34 | Error del envío registrado; la notificación en BD persiste |

---

### 5.15 `tests/components/**` — L3 · Escenas E16, E18, E20, E33

| ID | Componente | Escena | Aserción |
|---|---|---|---|
| `UI-01` | `LoginForm` | E02 | El modal de usuarios lista 6 cuentas institucionales, **ningún correo visible**, y "Usar" autocompleta el campo |
| `UI-02` | `LoginForm` | E03 | El modal demo renderiza todas las cuentas con su insignia de rol |
| `UI-03` | `AppShell` | E04 | La insignia *Modo Demo* aparece solo con `isDemo: true`; el menú lateral muestra las secciones del rol |
| `UI-04` | `StageItineraryBoard` | E16 | Con un paso `ENVIADA` muestra *«Enviado a coordinación, esperando validación»* y **no** renderiza el formulario; los UPCOMING solo muestran el título |
| `UI-05` | `NativeInstrumentForm` | E18 | Renderiza los 5 encabezados de sección de la Actividad 2 y el campo alias como opcional |
| `UI-06` | `NativeInstrumentForm` | E17 | Con `existingContentJson` (paso devuelto) precarga los valores previos en los campos |
| `UI-07` | `StageItineraryBoard` | E25 | Un paso `EXTERNAL_LINK` renderiza `ExternalLinkStepForm` (campo de URL) en vez del formulario nativo |
| `UI-08` | `NativeInstrumentForm` | E33 | Con `navigator.onLine = false`, "Guardar Borrador Local" escribe en `localStorage["per_offline_itinerary_<caseId>"]` |
| `UI-09` | `RegistroAcompanamientoForm` | E33 | Idem sobre `localStorage["per_offline_sessions"]`; al volver online aparece "🔄 Sincronizar ahora" |
| `UI-10` | `RegistroAcompanamientoForm` | E20 | El selector de Objetivo se puebla desde los objetivos recibidos por props, no con texto libre |
| `UI-11` | `ItineraryValidationPanel` | E17 | "❌ Devolver" queda deshabilitado mientras el campo de observación esté vacío |
| `UI-12` | `StageAdvanceButton` | E23 | Con `gate.satisfied: false` muestra la lista de faltantes y "Forzar avance de etapa" exige motivo |

---

## 6. Matriz de trazabilidad escena → pruebas

| Escena | Título | Pruebas |
|---|---|---|
| E02 | Login y directorio | `AUTH-01`, `AUTH-02`, `UI-01` |
| E03 | Modo Demo vs. Real | `AUTH-03`…`AUTH-06`, `AUTH-11`, `UI-02` |
| E04 | Navegación general | `UI-03` |
| E05 | Resumen nacional | `RPT-01` |
| E06 | Crear PER | `ADMN-01`, `ADMN-02`, `ADMN-08`, `ADMN-09` |
| E07 | Editar / eliminar con contraseña | `ADMN-03`…`ADMN-07`, `ADMN-10` |
| E08 | Catálogo de instrumentos | `INST-01`, `CAT-01`…`CAT-10` |
| E09 | Editor de ubicación | `INST-02`, `INST-03`, `INST-04`, `ITIN-05` |
| E10 | Reportes y snapshot | `RPT-02`…`RPT-09`, `TASK-05` |
| E11 | Auditoría | `AUD-*` (transversal: toda prueba L2 verifica su `AuditLog`) |
| E12 | Panel regional | `CASE-01`, `CASE-02`, `TASK-07` |
| E13 | Funnel Fase 2 | `CAND-01` |
| E14 | Conformar dupla | `CASE-03`…`CASE-09` |
| E15 | Vista PER | `NOM-01`, `NOM-04` |
| E16 | Tablero de itinerario | `ITIN-01`, `ITIN-02`, `UI-04` |
| E17 | Devolver / corregir / validar | `ITIN-03`, `ITIN-04`, `ITIN-06`, `ITIN-19`, `TASK-01`, `TASK-02`, `TASK-08`, `ACT-01`…`ACT-03`, `UI-06`, `UI-11` |
| E18 | Alias | `ITIN-07`, `ITIN-08`, `NOM-02`, `NOM-03`, `CAT-05`, `UI-05` |
| E19 | Actividades 3 y 4 | `ITIN-09`…`ITIN-11`, `CAT-07` |
| E20 | Registro de Acompañamiento | `SESS-01`…`SESS-03`, `ITIN-12`, `CAT-02`, `UI-10` |
| E21 | Bandeja de sesiones | `SESS-04`…`SESS-06`, `SESS-08` |
| E22 | Avisos del PER | `NOTIF-01`, `NOTIF-02` |
| E23 | Puerta de avance | `ITIN-13`…`ITIN-15`, `CASE-10`, `CASE-16`…`CASE-18`, `UI-12` |
| E24 | Forzar avance auditado | `CASE-11` |
| E25 | Enlace externo | `ITIN-15`, `TASK-03`, `UI-07` |
| E26 | Bloqueo de egreso | `ITIN-16`, `CASE-12`, `CAT-04` |
| E27 | Formulario de abandono | `ITIN-17`, `ITIN-18`, `CASE-13`, `CASE-14`, `CAT-03` |
| E28 | Deserción / 3 contactos | `CASE-15` |
| E29 | Habilitación PER | `SUP-01`, `SUP-02`, `TASK-04` |
| E30 | Supervisión | `SUP-03`…`SUP-05` |
| E31 | Redes | `NET-01`…`NET-03` |
| E32 | Alertas | `ALRT-01`…`ALRT-09`, `NOM-05` |
| E33 | Offline | `OFFL-01`…`OFFL-03`, `SESS-07`, `UI-08`, `UI-09` |
| E34 | PWA y push | `PUSH-01`, `PUSH-02` |

**Escenas sin prueba automatizada** (verificación manual obligatoria en el checklist de grabación): E01, E35 (narrativas), E34 parcialmente — la instalación PWA y la notificación nativa del sistema operativo dependen del navegador y solo se validan a mano.

---

## 7. Transversales: las cinco pruebas que hay que escribir primero

Si el tiempo es escaso, estas cinco cubren los riesgos más caros del pilotaje:

| Prioridad | ID | Por qué |
|---|---|---|
| 1 | `ITIN-04` | Si el desbloqueo secuencial se rompe, el itinerario del IAP deja de existir como tal |
| 2 | `CASE-12` | Egresar sin Encuesta de Satisfacción es un incumplimiento directo del convenio |
| 3 | `ITIN-20` / `TASK-09` / `SESS-09` | Una fuga entre modo demo y modo real contamina los datos oficiales del pilotaje |
| 4 | `CASE-01` / `TASK-07` | Un coordinador viendo otra región es una falla de privacidad de datos sensibles |
| 5 | `SESS-07` / `OFFL-02` | La duplicación de registros offline inflaría artificialmente los indicadores de adherencia |

---

## 8. Plan de implementación sugerido

| Hito | Alcance | Esfuerzo |
|---|---|---|
| **H1** | Instalación, `vitest.config.ts`, setups, helpers y fábricas + grupo `CAT-*` y `NOM-*` (L1, sin BD) | 1 día |
| **H2** | `itinerary.service.test.ts` completo (`ITIN-01`…`ITIN-21`) — el núcleo | 1–2 días |
| **H3** | `cases.service` + `tasks.service` (`CASE-*`, `TASK-*`) | 1–2 días |
| **H4** | `sessions`, `alerts`, `instruments` | 1 día |
| **H5** | Extracción de `computeKpis()` a `reports.service.ts` + `RPT-*` | 1 día |
| **H6** | Server actions (`AUTH-*`, `ADMN-*`, `ACT-*`, `OFFL-*`) | 1–2 días |
| **H7** | Componentes L3 (`UI-*`) | 1 día |
| **H8** | Integración en CI + umbrales de cobertura + reporte para el video | 0,5 día |

---

## 9. Nota sobre el uso de las pruebas en el video

Si el video incluye una escena técnica de verificación, grabar:

```bash
npm run test:guion
```

La salida lista cada prueba con su ID (`[ITIN-04] validar desbloquea el siguiente paso…`), lo que permite mostrar en pantalla que **cada afirmación del guión está verificada automáticamente**. Es especialmente útil para la audiencia técnica de SENDA: no se está mostrando una demo montada, se está mostrando un comportamiento probado.

---

## 10. Deudas técnicas detectadas al diseñar la batería

Estas son limitaciones reales del código que la estructura de pruebas hace evidentes. Ninguna bloquea la grabación, pero conviene registrarlas:

1. **`src/lib/db.ts` fija la ruta SQLite local** (`file:dev.db`) sin variable de entorno. Obliga al truco de `globalThis.prisma` en el setup. Una línea de refactor lo resuelve (§3.2).
2. **El cálculo de los KPIs vive dentro del componente de página** `/admin/reportes/page.tsx` (≈250 líneas de lógica). No es testeable sin extraerlo a un service (§5.12) — es el prerrequisito del hito H5.
3. **Las server actions tragan errores con `console.error`** y retornan `void` (por ejemplo `validateItineraryStepAction`, `validateSessionAction`). Las pruebas deben verificar el efecto en la BD, no el valor de retorno; y en la UI un fallo de validación es hoy silencioso para el usuario.
4. **`getItineraryState` llama `assertStageAdvanceAllowed`, que consulta la BD una vez por instrumento del gate** (bucle secuencial). Correcto pero con N+1; conviene una prueba de regresión sobre el número de consultas si el catálogo crece.
5. **Inconsistencia `LOS` / `RIO`** en la abreviatura de Los Ríos entre el seed y `getRegionAbbreviation()` — cubierta por `CASE-04`, que fallará hasta que se unifique. Ver §Discrepancias en [Guion.md](Guion.md).
