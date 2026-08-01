# Estructura del Proyecto y Secciones de la Aplicación

Este documento detalla la arquitectura técnica, la distribución de directorios, los principales archivos de código y las especificaciones funcionales de cada una de las vistas de la **Plataforma de Coordinación PER 2026-2027**.

---

## 1. Arquitectura y Estructura de Directorios

El proyecto está construido sobre **Next.js (App Router)** utilizando la versión 16, TypeScript, Tailwind CSS para estilos, y **Prisma ORM** interactuando con SQLite (`dev.db`) en desarrollo local y **Turso (libSQL)** en producción, vía `@prisma/adapter-libsql`. El adaptador se resuelve dinámicamente en `src/lib/db.ts` según qué variables de entorno estén presentes (`TURSO_DATABASE_URL`/`DATABASE_URL` → Turso; si no, SQLite local vía `@prisma/adapter-better-sqlite3`).

```
/
├── prisma/
│   ├── schema.prisma           # Definición de modelos de base de datos (SQLite local / Turso libSQL en producción)
│   ├── seed.ts                 # Siembra completa de datos demo (bloqueada contra producción, ver seed-bootstrap.ts)
│   ├── seed-bootstrap.ts       # Siembra idempotente y no destructiva, segura para producción (catálogo + coordinaciones + 1 admin)
│   ├── catalog/
│   │   ├── instruments.ts      # Catálogo compartido de los 16 Instrument + Settings (usado por seed.ts y seed-bootstrap.ts)
│   │   └── coordinators.ts     # Datos de los 5 Coordinadores Regionales reales
│   └── migrations/             # Migraciones SQL escritas a mano, aplicadas manualmente contra Turso
├── public/
│   ├── manifest.json           # Configuración del PWA (Standalone, colores, iconos)
│   ├── Resumen.md               # Fundamentación técnica enlazada desde el login
│   └── sw.js                   # Service Worker (Caché offline y recibidor de notificaciones push)
└── src/
    ├── app/                    # Enrutamiento de la aplicación (App Router Groups por Rol)
    │   ├── (admin)/admin       # Panel y secciones del Súper Administrador
    │   ├── (auth)/login        # Control de acceso y sesiones
    │   ├── (coord)/coor...     # Panel y flujos del Coordinador Técnico Regional
    │   ├── (per)/per           # Panel móvil e itinerario del Par Especialista (PER)
    │   ├── actions/            # Acciones del Servidor (itinerary.ts, admin.ts, coordinator.ts, per.ts, auth.ts...)
    │   └── api/push            # Endpoints para suscripción de notificaciones push
    ├── components/
    │   ├── shell/AppShell.tsx  # Contenedor principal con menús responsivos y campana de avisos
    │   ├── admin/               # InstrumentPlacementEditor.tsx (etapa + orden editable)
    │   ├── coordinator/         # ItineraryValidationPanel, StageAdvanceButton, WithdrawalGate
    │   ├── per/                 # StageItineraryBoard, NativeInstrumentForm, RegistroAcompanamientoForm, ExternalLinkStepForm, CompletedStepSummary
    │   └── PWARegistration.tsx # Registrador del Service Worker e iniciador de suscripciones push
    ├── lib/
    │   ├── db.ts                # Selección dinámica de adaptador Prisma (Turso vs. SQLite local)
    │   ├── auth.ts               # Sesión firmada por cookie; modo demo/real definido por el método de login, no por el usuario
    │   ├── instrument-itinerary.ts # Catálogo puro del itinerario secuencial (actividades, campos de formulario, gating por etapa)
    │   └── nomenclatures.ts     # Traducción de estados a etiquetas oficiales + formatCaseLabel (código + alias)
    └── server/services/         # Lógica de negocio: cases, tasks, sessions, itinerary, instruments, alerts, push
```

---

## 2. Archivos Principales y Funciones

* **[schema.prisma](prisma/schema.prisma)**: Define el modelo relacional del pilotaje. Incluye tablas clave para la auditoría y control técnico: `PACase` (casos de personas acompañadas, con `alias` opcional), `PERProfile` (perfil del acompañante PER), `Instrument` (catálogo de instrumentos, con `order`/`activityKey`/`submissionMode`/`triggerCondition` para el itinerario), `Task` (materialización de cada paso del itinerario para un caso, con `contentJson` para formularios nativos), `SessionLog` (Registro de Acompañamiento), `IAPGoal`/`IAPDomainMap` (objetivos y mapa de recursos versionados), `Supervision` (minutas de supervisiones individuales de dupla) y `PushSubscription` (tokens de push).
* **[instrument-itinerary.ts](src/lib/instrument-itinerary.ts)**: Catálogo puro (sin lógica de base de datos) que define cada actividad del itinerario — su etapa, orden, campos de formulario y si cuenta para el gate de avance de etapa. Es la fuente de verdad que usan tanto el PER (para renderizar el formulario) como el coordinador (para mostrar el contenido enviado).
* **[itinerary.service.ts](src/server/services/itinerary.service.ts)**: Núcleo del itinerario secuencial. `ensureCurrentStageTasks()` materializa únicamente la siguiente `Task` pendiente de la etapa actual de un caso (evita mostrar todos los instrumentos a la vez); `assertStageAdvanceAllowed()` calcula si todos los instrumentos obligatorios de la etapa están validados antes de permitir el avance.
* **[AppShell.tsx](src/components/shell/AppShell.tsx)**: Componente envolvente principal de la UI. Implementa:
  - Control de estado de conexión (*Banner Offline* automático).
  - Campana de avisos in-app con polling reactivo de 15 segundos, insignia de pendientes y animación interactiva (tiembla 3 veces al recibir avisos nuevos).
  - Redireccionamiento interactivo y efecto de destello temporizado de 2.5s (`animate-highlight`) al consultar recursos.
  - Menú hamburguesa responsivo y cajón lateral deslizante (`animate-slide-in-left`) en móviles para roles administrativos.
  - Banner de suscripción a notificaciones push a nivel de dispositivo (opt-in integrado con el Service Worker).
* **[push.service.ts](src/server/services/push.service.ts)**: Administra el ciclo de vida de los avisos Web Push. El helper `createNotificationWithPush()` unifica la creación del registro en base de datos y la transmisión de carga útil cifrada (payload) a los dispositivos suscritos de forma no bloqueante mediante `setImmediate`.
* **[sw.js](public/sw.js)**: Service Worker encargado de almacenar en caché los activos estáticos para el funcionamiento sin conexión a internet y escuchar el evento `push` del navegador para disparar la alerta nativa del dispositivo, redirigiendo al usuario a la vista exacta al hacer clic.
* **[GoogleAppsScript.gs](GoogleAppsScript.gs)**: Código de Google Apps Script listo para ser copiado en el editor de Apps Script. Configura las llamadas de creación de jerarquías de Drive, copias de plantillas IAP, agendamientos de Calendar y sincronización de Google Sheets.
* **[workspace.ts](src/server/google/workspace.ts)**: Administrador de la integración con Workspace. De forma dinámica, llama a la Web App de Google Apps Script si está la variable de entorno `GOOGLE_APPS_SCRIPT_URL`, o realiza la simulación simulada (mock) local en caso contrario.

---

## 3. Secciones Metodológicas Detalladas por Rol

La plataforma implementa un estricto control de acceso basado en roles (RBAC) y filtrado por región para proteger la privacidad de los metadatos de las personas acompañadas.

### A. Vista del Súper Administrador Nacional (`(admin)/admin`)

Panel de control centralizado enfocado en la transparencia, auditoría y control presupuestario para la liberación de remesas.

#### 1. Gestión de Usuarios (`/admin/usuarios`)
* **Función**: Alta, edición, baja y activación/desactivación de las cuentas de Acompañantes PER. Muestra por separado la nómina de PER (editable) y la de los 5 Coordinadores Regionales (fijos).
* **Crear**: Formulario con nombre, usuario y coordinación regional asignada; genera el correo institucional `usuario@per2026.cl` automáticamente.
* **Editar / Eliminar**: Ambas acciones abren un modal que exige la **contraseña compartida de modo real** (`verifyRealModePassword()` en `src/lib/auth.ts`) antes de aplicar el cambio. La eliminación se bloquea a nivel de servidor (`src/app/actions/admin.ts`) si el PER tiene algún `PACase` asociado, para no dejar casos huérfanos.
* **Auditoría**: Creación, edición y eliminación quedan registradas como `CREACION_USUARIO_PER` / `EDICION_USUARIO_PER` / `ELIMINACION_USUARIO_PER` en `AuditLog`.

#### 2. Consola de KPIs y Reportes Oficiales (`/admin/reportes`)
* **Función**: Panel cuantitativo que calcula y muestra las **8 métricas críticas del convenio** exigidas por SENDA (adherencia $\ge 3$ meses, tasa del 60% de casos nuevos, evaluación ex-ante/ex-post completadas al 80%, entre otros).
* **Filtros e Historial**: Permite desagregar las estadísticas por región, sexo/género, rango etario, nivel de estudios y situación laboral.
* **Congelamiento de Snapshots**: Botón para "congelar" y almacenar reportes inmutables para un periodo determinado. Genera un registro histórico del reporte oficial y emite notificaciones push a los coordinadores regionales.

#### 3. Catálogo de Instrumentos del PER (`/admin/instrumentos`)
* **Función**: Catálogo oficial de herramientas y encuestas vigentes que guían el itinerario de acompañamiento personalizado.
* **Componentes**: Muestra tarjetas agrupadas por fase (Fase 1 a 5) con contadores que diferencian si el instrumento es un documento colaborativo en Drive (`GOOGLE_DOC`) o un formulario de entrada (`GOOGLE_FORM`).
* **Estados y Progreso**: Clasifica los recursos en *Vigente*, *Borrador* o *Archivado*. Configura cuáles instrumentos son obligatorios, si bloquean el avance de fase del caso, o si requieren validación obligatoria por parte de la coordinación regional.
* **Ubicación en el itinerario**: Para los instrumentos del itinerario secuencial, `InstrumentPlacementEditor` permite reasignar en caliente su etapa (`stageId`) y orden (`order`) dentro de ella — ese orden es el que determina qué actividad ve el PER como paso actual.

#### 4. Auditoría Inmutable de Eventos (`/admin/auditoria`)
* **Función**: Registro cronológico e inalterable de cada mutación de datos clave en la plataforma (creación de casos, asignación de duplas, egresos, retiros forzados, y configuraciones).
* **Auditoría**: Registra el ID de usuario, rol, fecha, acción, dirección IP y los valores previos/nuevos en formato JSON para evidenciar el control técnico ante los auditores de SENDA.

---

### B. Vista del Coordinador Técnico Regional (`(coord)/coordinacion`)

Panel de control enfocado en el monitoreo diario de casos, validación metodológica y soporte técnico regional.

#### 1. Nómina y Preselección de Candidatas (`/coordinacion/candidatas`)
* **Función**: Control del funnel de Fase 2 para el ingreso de personas acompañadas.
* **Componentes**: Muestra el funnel metodológico interactivo a través de sus **7 estados oficiales** (Derivada $\rightarrow$ Contactada $\rightarrow$ Preinscrita $\rightarrow$ Entrevistada $\rightarrow$ Admisible $\rightarrow$ Seleccionada $\rightarrow$ En espera).
* **Conformación de Duplas**: Formulario para asignar a una candidata admisible con un acompañante PER habilitado en la región, ingresando la fundamentación técnica que justifica el match de la dupla.

#### 2. Acompañamientos y validación del itinerario (`/coordinacion/casos`)
* **Funcionamiento**: Ficha de caso con timeline metodológico (cambios de fase, intentos de contacto, registros de acompañamiento y eventos de tareas) más el componente `ItineraryValidationPanel`, que muestra el paso actual del itinerario que el PER envió y permite **"✅ Validar"** o **"❌ Devolver"** (con observación obligatoria).
* **Avance de Fase**: `StageAdvanceButton` habilita el botón de transición (`VINCULACION` $\rightarrow$ `CONEXION` $\rightarrow$ `FINALIZACION` $\rightarrow$ `EGRESO`) solo cuando `assertStageAdvanceAllowed()` confirma que todos los instrumentos con `countsTowardStageGate: true` de la etapa actual están validados. Si falta alguno, muestra la lista de pendientes y un botón de **"Forzar avance de etapa"** que exige un motivo escrito y queda auditado.
* **Validación de Bloqueos (Egreso)**: El gate de la etapa Finalización exige *Actividad 5 (Final)*, *Actividad 6* y la *Encuesta de Satisfacción* validadas. En caso de omisión, despliega un banner de advertencia contextual: *«Requisito Metodológico del Convenio»*.
* **Retiro Voluntario y Deserción**: `WithdrawalGate` habilita bajo demanda el Formulario de Abandono correspondiente (persona acompañada o PER) — un instrumento más del catálogo con `triggerCondition: "ON_WITHDRAWAL"` — que debe completarse y validarse antes de cerrar el caso. Exige al menos 3 intentos de contacto registrados previamente en la base de datos antes de permitir marcar deserción voluntaria.

#### 3. Validación de Registros de Acompañamiento (`/coordinacion/sesiones`)
* **Función**: Bandeja de entrada y revisión metodológica de los Registros de Acompañamiento (encuentros recurrentes de la etapa Conexión, modelo `SessionLog`) enviados por los PER — independiente del panel de itinerario del punto anterior.
* **Componentes**:
  - **Bandeja de Entrada**: Tarjetas de vista previa responsiva con resumen de registros en estado `ENVIADA`.
  - **Modal de Detalle Completo**: Al hacer clic en una tarjeta, se abre una ventana modal con todos los campos del `SessionLog` (Fecha, Modalidad, Ámbito de Recuperación, Objetivo asociado, Emoción, Descripción y Reflexión del PER).
  - **Acciones y Retroalimentación**: Permite aprobar el registro directamente o escribir comentarios de observación en un campo dedicado y devolverlo al PER en el pie del mismo modal.

#### 4. Dotación PER y Supervisiones (`/coordinacion/supervisiones`)
* **Función**: Monitorea el estado de habilitación técnica de los acompañantes y controla el cumplimiento metodológico del pilotaje.
* **Componentes**:
  - **Listado de PER**: Registro de acompañantes regionales indicando su estado (*Habilitado* o *Pendiente*) y si firmaron/validaron su Código de Ética. **Incluye botones de acción para que el Coordinador o Admin pueda Habilitar o Suspender directamente a un profesional desde la interfaz**, actualizando su estatus para permitirle o bloquearle la asignación de tareas críticas y casos nuevos.
  - **Supervisión Técnica**: Formulario para registrar las reuniones semanales obligatorias de supervisión de dupla. Genera automáticamente una cita de reunión y enlace de Google Meet mediante la API de Google Calendar y notifica al PER.

#### 5. Gestión de Redes e Integración Social (`/coordinacion/redes`)
* **Función**: Catálogo de dispositivos y mapa de actores territoriales activos para derivaciones e integración de Fase 5.
* **Componentes**:
  - **Dispositivos Territoriales**: Registro de instituciones y redes locales (Salud, Empleo, Educación, Habitabilidad, etc.) con sus personas de contacto.
  - **Activación de Red**: Bitácora de derivaciones que asocia un caso con un dispositivo de la red territorial, registrando el informe de vinculación social.
  - **Actividades Grupales**: Registro de encuentros de equipos, Focus Groups regionales y Open Spaces de Fase 5.

#### 6. Alertas, Hitos y Entregables (`/coordinacion/alertas`)
* **Función**: Central de notificaciones críticas del pilotaje.
* **Componentes**:
  - **Hitos Pendientes**: Muestra hitos documentales enviados por los PER (IAP, Evaluaciones Intermedia/Ex-Post, etc.) pendientes de aprobación.
  - **Alertas de Inactividad**: Alertas automáticas gatilladas por el sistema si una dupla registra inactividad metodológica (sin Registros de Acompañamiento) durante 14 días.
  - **Instrumento pendiente de validación / Etapa estancada**: reglas nuevas del itinerario que alertan cuando un paso lleva enviado varios días sin que coordinación lo revise, o cuando un caso no avanza de etapa a pesar de tener todo validado.

---

### C. Vista del Par Especialista en Recuperación (`(per)/per`)

Aplicación móvil PWA (diseño de un toque y carga veloz) pensada para el trabajo en terreno de los acompañantes PER. Navegación fija de 3 pestañas: **Mi Agenda** (`/per`), **Casos Activos** (`/per/casos`) y **Avisos** (`/per/avisos`).

#### 1. Mi Agenda y Casos Activos
* **Función**: `/per` lista los acompañamientos activos y redirige directo a la etapa del caso si el PER tiene solo uno asignado. `/per/casos` muestra el listado completo, con `formatCaseLabel()` mostrando el alias junto al código cuando existe (ej. `PA-MET-001 (Fer)`).

#### 2. Itinerario del caso (`/per/casos/[caseId]/etapa`)
* **Función**: `StageItineraryBoard` muestra los pasos completados (colapsables), el paso actual (con su formulario) y los próximos (bloqueados, solo título). `ensureCurrentStageTasks()` en el servidor garantiza que solo exista materializada la `Task` del siguiente paso pendiente — nunca toda la etapa de una vez.
* **`NativeInstrumentForm`**: renderiza los formularios nativos del itinerario (Primer Encuentro, Actividad 1-6) a partir de los campos definidos en `instrument-itinerary.ts`; soporta agrupación visual por `section` (usado en Actividad 2, que agrupa 13 preguntas en 5 secciones).
* **`RegistroAcompanamientoForm`**: formulario recurrente de la etapa Conexión (uno por encuentro, no un paso único). El selector de Objetivo se llena con `getCurrentGoalsForCase()`, que trae los `IAPGoal` vigentes (`isCurrent: true`) definidos en la Actividad 4. Sigue escribiendo al modelo `SessionLog`.
* **`ExternalLinkStepForm`**: para instrumentos con `submissionMode: "EXTERNAL_LINK"` (ej. Encuesta de Satisfacción), donde el PER pega la URL del documento en vez de llenar un formulario nativo.
* **Funcionamiento Offline**: ambos tipos de formulario almacenan borradores en `localStorage` si no hay internet, y los sincronizan con un toque al recuperar conectividad.
