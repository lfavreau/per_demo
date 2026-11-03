# Estructura del Proyecto y Secciones de la Aplicación

Este documento detalla la arquitectura técnica, la distribución de directorios, los principales archivos de código y las especificaciones funcionales de cada una de las vistas de la **Plataforma de Coordinación PER 2026-2027** (etapa beta).

---

## 1. Arquitectura y Estructura de Directorios

El proyecto está construido sobre **Next.js 16 (App Router)** con React 19, TypeScript, Tailwind CSS 4 y **Prisma ORM 7** sobre SQLite: archivo local `dev.db` en desarrollo y **Turso (libSQL)** en producción. El adaptador se elige en tiempo de ejecución en `src/lib/db.ts` (Turso → Cloudflare D1 → SQLite local).

```
/
├── docs/                     # Documentación (Manual, Guía, Estructura, Síntesis, despliegue Workspace)
├── prisma/
│   ├── schema.prisma         # Modelos de base de datos (SQLite / Turso)
│   ├── seed.ts               # Datos demostrativos del pilotaje
│   └── migrations/           # Migraciones SQL manuales (ej. separación demo/real)
├── public/
│   ├── manifest.json         # Configuración PWA (standalone, colores, íconos)
│   ├── sw.js                 # Service Worker (caché offline y recepción de push)
│   ├── icons/                # Íconos PWA
│   └── Resumen.md            # Resumen operativo (enlazado desde el login)
├── GoogleAppsScript.gs       # Web App de Apps Script (Drive, Docs, Calendar, Sheets)
└── src/
    ├── app/                  # Enrutamiento (App Router, grupos por rol)
    │   ├── (admin)/admin     # Panel del Administrador Nacional
    │   ├── (auth)/login      # Acceso (modo real y modo demo)
    │   ├── (coord)/coordinacion # Panel del Coordinador Regional
    │   ├── (per)/per         # Panel móvil del PER
    │   ├── actions/          # Server Actions (admin, auth, coordinator, per, notifications)
    │   └── api/push          # Endpoints de suscripción push
    ├── components/
    │   ├── shell/AppShell.tsx       # Contenedor principal: menús, campana de avisos, banner offline
    │   ├── sessions/                # Formulario de bitácora y cola de validación
    │   ├── tasks/TaskSubmitForm.tsx # Entrega de tareas con enlace Drive
    │   ├── auth/LoginForm.tsx       # Formulario de acceso y accesos demo
    │   ├── ExportCsvButton.tsx      # Exportación CSV
    │   └── PWARegistration.tsx      # Registro del Service Worker
    ├── lib/                  # auth (cookie firmada HMAC), db, nomenclaturas, utilidades Google
    └── server/
        ├── services/         # Lógica de negocio: cases, sessions, tasks, alerts, push
        └── google/workspace.ts # Puente a Apps Script (o simulación local)
```

> La carpeta `archivos_antiguos/` (scripts y dumps históricos) está fuera del repositorio vía `.gitignore`.

---

## 2. Archivos Principales y Funciones

* **[schema.prisma](../prisma/schema.prisma)**: Modelo relacional del pilotaje. Tablas clave: `PACandidate` (funnel Fase 2), `PACase` (casos, código `PA-{REG}-{NNN}` y `alias` opcional solo para vistas), `PERProfile` (perfil del PER), `SessionLog` (bitácoras), `Task` (hitos documentales), `IAPRecord` (IAP), `Supervision`, `Alert`, `NetworkDevice` / `NetworkActivation` (redes), `Phase5Record`, `DocumentRecord`, `ReportSnapshot`, `AuditLog`, `Notification` y `PushSubscription`. Casi todas las tablas operativas llevan `isDemo` para aislar el modo demostrativo.
* **[AppShell.tsx](../src/components/shell/AppShell.tsx)**: Contenedor principal de la UI:
  - Banner automático de estado sin conexión.
  - Campana de avisos in-app con consulta cada 15 segundos, insignia de pendientes y animación al recibir avisos nuevos.
  - Resaltado temporal (`animate-highlight`) al llegar a un recurso desde un aviso.
  - Menú hamburguesa y cajón lateral en móviles para roles de coordinación y administración.
  - Banner de suscripción a notificaciones push.
* **[nomenclatures.ts](../src/lib/nomenclatures.ts)**: Etiquetas oficiales para estados de caso, tipos de alerta, emociones (Bien / Neutro / Triste / Molesto), ámbitos de recuperación y estado del PER (Habilitado / Deshabilitado).
* **[push.service.ts](../src/server/services/push.service.ts)**: Ciclo de vida de Web Push. `createNotificationWithPush()` crea el aviso en base de datos y lo envía a los dispositivos suscritos sin bloquear la respuesta.
* **[sw.js](../public/sw.js)**: Service Worker que guarda en caché los activos estáticos (red primero, caché de respaldo) y muestra la notificación nativa al recibir un `push`, abriendo la vista correspondiente al hacer clic.
* **[GoogleAppsScript.gs](../GoogleAppsScript.gs)**: Web App de Apps Script. Crea la jerarquía de carpetas en Drive, copia la plantilla IAP, agenda eventos en Calendar y sincroniza Google Sheets. Las operaciones son idempotentes (un reintento no duplica carpetas ni documentos).
* **[workspace.ts](../src/server/google/workspace.ts)**: Llama a la Web App si existe `GOOGLE_APPS_SCRIPT_URL`; si no, o en modo demo, usa una simulación local.

---

## 3. Secciones por Rol

La plataforma aplica control de acceso por rol (ADMIN, COORDINATOR, PER) y filtrado por región. Las personas acompañadas se identifican solo por código, nunca por nombre o RUT.

### A. Administrador Nacional (`(admin)/admin`)

#### 1. Resumen (`/admin`)
* Indicadores nacionales filtrables por región: cupos y uso por región, casos activos, candidatas, tareas (atrasadas, validadas, en revisión, pendientes), bitácoras e instrumentos.
* Botón **Sincronizar Google Workspace** (vuelca datos a Sheets).

#### 2. Gestión de Usuarios (`/admin/usuarios`)
* Crea cuentas PER (nombre, usuario, región). El PER queda **habilitado** desde su creación.
* Botón **Deshabilitar / Habilitar** por PER (controla el acceso). La cuenta `admin@per2026.cl` no se puede deshabilitar.

#### 3. Consola de Reportes SENDA (`/admin/reportes`)
* **Síntesis ejecutiva**: casos registrados, adherencia general, % nuevos acompañamientos (meta 60%) y satisfacción al cierre (meta 80%).
* **Seguimiento operativo**: capitales de recuperación por ámbito (ex-ante / ex-post desde registros IAP), niveles de intensidad (incluye "sin nivel asignado"), sesiones validadas por etapa y adherencia ≥ 90 días en continuidad (KPI 1.1), supervisiones y evaluaciones intermedias, activaciones de red por tipo, encuestas de cierre.
* **Caracterización**: desagregación por género, rango etario, nivel educacional y situación laboral. Los datos faltantes se cuentan como "Sin registrar".
* **Filtros**: región y período de informe (Informes 2 a 6 con sus fechas de corte).
* **Congelar Snapshot**: guarda un reporte inmutable para el período (evidencia para remesas) y notifica a coordinación. Exportación CSV de la matriz general.

#### 4. Catálogo de Instrumentos (`/admin/instrumentos`)
* Herramientas y formularios oficiales agrupados por fase (1 a 5), con contadores por tipo (`GOOGLE_DOC`, `GOOGLE_FORM`, etc.).
* Estado *Vigente*, *Borrador* o *Archivado*; marca si es obligatorio, si bloquea avance de fase y si requiere validación de coordinación.

#### 5. Auditoría (`/admin/auditoria`)
* Registro cronológico de mutaciones clave (creación de casos y usuarios, duplas, validaciones, egresos, retiros).
* Guarda usuario, rol, fecha, acción, entidad y valores previos/nuevos. Exportación a CSV.

---

### B. Coordinador Regional (`(coord)/coordinacion`)

#### 1. Resumen Regional (`/coordinacion`)
* Estadísticas de tareas, funnel de Fase 2 y casos por etapa. Botón **Evaluar Alertas**.

#### 2. Registro de ingresos (`/coordinacion/candidatas`)
* Funnel de ingreso: Derivada → Contactada → Preinscrita → Entrevistada → Admisible → Seleccionada → En espera (además *No admisible* y *Descartada*).
* **Conformación de duplas**: asigna una candidata apta a un PER habilitado de la región, con fundamentación del match. La dupla queda *Propuesta*.

#### 3. Acompañamientos (`/coordinacion/casos`)
* **Ciclo del match**: Propuesto → Validado → Formalizado (con enlace al Acta de Primer Encuentro). Al formalizar se crea la carpeta Drive del caso y el IAP desde plantilla; la ficha muestra **Abrir carpeta**, **Abrir IAP** y **Abrir Acta**.
* **Timeline** del caso: sesiones, tareas y tránsitos de estado.
* **Avance de etapa**: `VINCULACION` → `CONEXION` → `FINALIZACION` → `EGRESO`.
* **Bloqueo de egreso**: exige *Evaluación Ex-Post* y *Encuesta de Satisfacción* validadas; si faltan, muestra el aviso «Requisito Metodológico del Convenio».
* **Retiro voluntario / Deserción**: se registran con motivo y enlace opcional al formulario. Cierran el caso y liberan al PER. Los intentos de contacto se gestionan fuera de la app.
* **Caso de continuidad directo**: alta de un caso de continuidad asignado a un PER habilitado.

#### 4. Validación de Sesiones (`/coordinacion/sesiones`)
* Bandeja de bitácoras en estado `ENVIADA`.
* Modal con todos los campos (fecha, asistencia, modalidad, ámbito IAP, duración, emoción, resumen, acuerdos, dificultades, próxima acción, reflexión).
* Aprobar o devolver con observaciones al PER.

#### 5. Supervisiones (`/coordinacion/supervisiones`)
* Listado de PER de la región con estado (*Habilitado* / *Deshabilitado*), casos activos, horas de supervisión y semáforo de cumplimiento (⚠️ > 15 días, 🔴 > 30 días sin supervisión).
* Registro de supervisiones (fecha, modalidad, duración, casos revisados, acuerdos). En modo real se agenda en Google Calendar y se notifica al PER.

#### 6. Gestión de Redes (`/coordinacion/redes`)
* **Dispositivos territoriales** por tipo: Salud, Empleo, Vivienda, Educación, Otro.
* **Activación de red**: derivación de un caso a un dispositivo.
* **Actividades Fase 5**: focus groups y reuniones de equipo, con enlace al acta.

#### 7. Alertas y Tareas (`/coordinacion/alertas`)
* **Hitos pendientes** de validación enviados por los PER.
* **Alertas de seguimiento**: caso sin bitácoras por más de 10 / 14 / 10 días según etapa (umbrales configurables en `Setting`).
* **Alertas documentales**: tareas atrasadas y tareas críticas asignadas a un PER deshabilitado.

---

### C. PER (`(per)/per`)

Vista móvil PWA de una sola página, pensada para terreno. Uso principal en beta: registrar sesiones, avances de etapa y actividades.

#### 1. Mis Acompañamientos Activos
* Casos asignados (normalmente uno) con etapa y tipo (Nuevo / Continuidad).

#### 2. Registro de Bitácora
* Caso, fecha, modalidad, duración, ámbito trabajado (9 ámbitos), asistencia, resumen, acuerdos, dificultades, próxima acción, registro emocional (😊 Bien, 😐 Neutro, 😢 Triste, 😠 Molesto) y reflexión.
* **Offline**: sin conexión guarda borradores en `localStorage`; al volver la señal se envían con **Sincronizar ahora**.

#### 3. Agenda de Tareas
* Hitos documentales de sus casos. El PER pega el enlace Drive y envía a revisión; si se devuelve, ve la observación y reenvía.

#### 4. Historial, Supervisiones y Avisos
* Últimas 5 bitácoras con su estado, supervisiones registradas por coordinación y avisos.

---

## 4. Estado del PER

| Estado | Significado |
|---|---|
| **Habilitado** | Cuenta registrada por el administrador. Opera y recibe casos. |
| **Deshabilitado** | Cuenta deshabilitada desde *Gestión de Usuarios*. No ingresa ni recibe casos nuevos. |

En base de datos, `User.active` controla el acceso. `PERProfile.certificationStatus = "NO_HABILITADO"` también bloquea casos y tareas críticas; el valor legado `PENDIENTE` se trata como habilitado.

---

## 5. Despliegue

| Destino | Notas |
|---|---|
| **Vercel + Turso** | Producción principal. Variables en [GOOGLE_WORKSPACE_DEPLOY.md](GOOGLE_WORKSPACE_DEPLOY.md). |
| **Cloudflare (OpenNext)** | Alternativa: `wrangler.json`, `open-next.config.ts`, adaptador D1. |
