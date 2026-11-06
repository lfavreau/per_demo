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
    │   ├── coordinator/         # ItineraryValidationPanel, StageAdvanceButton, WithdrawalGate, CandidateStatusSelect
    │   ├── per/                 # StageItineraryBoard, NativeInstrumentForm, RegistroAcompanamientoForm, ExternalLinkStepForm, CompletedStepSummary, SessionHighlightModal
    │   ├── sessions/SessionValidationQueue.tsx # Bandeja de Registros de Acompañamiento pendientes, compartida por /coordinacion/alertas
    │   └── PWARegistration.tsx # Registrador del Service Worker e iniciador de suscripciones push
    ├── lib/
    │   ├── db.ts                # Selección dinámica de adaptador Prisma (Turso vs. SQLite local)
    │   ├── auth.ts               # Sesión firmada por cookie; modo demo/real definido por el método de login, no por el usuario
    │   ├── instrument-itinerary.ts # Catálogo puro del itinerario secuencial (actividades, campos de formulario, gating por etapa)
    │   ├── nomenclatures.ts     # Traducción de estados a etiquetas oficiales + formatCaseLabel (código + alias)
    │   └── program-config.ts   # Parámetros del programa: REGIONS (cupo), MAX_ACTIVE_CASES_PER_PER, SUPERVISION_ALERT_DAYS
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

---

## 3. Secciones Metodológicas Detalladas por Rol

La plataforma implementa un estricto control de acceso basado en roles (RBAC) y filtrado por región para proteger la privacidad de los metadatos de las personas acompañadas.

### A. Vista del Súper Administrador Nacional (`(admin)/admin`)

Panel de control centralizado enfocado en la transparencia, auditoría y control presupuestario para la liberación de remesas.

#### 1. Gestión de Usuarios (`/admin/usuarios`)
* **Función**: Alta, edición, baja y activación/desactivación de las cuentas de Acompañantes PER. Muestra por separado la nómina de PER (editable) y la de los 5 Coordinadores Regionales (fijos).
* **Crear**: Formulario con nombre, usuario y coordinación regional asignada; genera el correo institucional `usuario@per2026.cl` automáticamente. El PER nace **activo** — se asume que la contratación ya se resolvió en la reunión de coordinación, fuera de la app.
* **Estado (Activo / Inactivo)**: columna *Estado* y botón Desactivar / Activar (`toggleUserStatusAction`, campo `User.active`). Un PER inactivo no inicia sesión, no aparece para asignar casos y, si tiene tareas críticas, genera una alerta. Es el único estado del PER; `PERProfile.certificationStatus` quedó como campo legado sin uso en la lógica.
* **Editar / Eliminar**: Ambas acciones abren un modal que exige la **contraseña compartida de modo real** (`verifyRealModePassword()` en `src/lib/auth.ts`) antes de aplicar el cambio. La eliminación se bloquea a nivel de servidor (`src/app/actions/admin.ts`) si el PER tiene algún `PACase` asociado, para no dejar casos huérfanos.
* **Auditoría**: Creación, edición y eliminación quedan registradas como `CREACION_USUARIO_PER` / `EDICION_USUARIO_PER` / `ELIMINACION_USUARIO_PER` en `AuditLog`; activar o desactivar como `ACTIVACION_USUARIO` / `DESACTIVACION_USUARIO`.

#### 2. Consola de KPIs y Reportes Oficiales (`/admin/reportes`)
* **Función**: Panel cuantitativo que calcula y muestra las **8 métricas críticas del convenio** exigidas por SENDA (adherencia $\ge 3$ meses, tasa del 60% de casos nuevos, evaluación ex-ante/ex-post completadas al 80%, entre otros).
* **Filtros e Historial**: Permite desagregar las estadísticas por región, sexo/género, rango etario, nivel de estudios y situación laboral.
* **Congelamiento de Snapshots**: Botón para "congelar" y almacenar reportes inmutables para un periodo determinado. Genera un registro histórico del reporte oficial y emite notificaciones push a los coordinadores regionales.

#### 3. Catálogo de Instrumentos del PER (`/admin/instrumentos`)
* **Función**: Catálogo oficial de herramientas y encuestas vigentes que guían el itinerario de acompañamiento personalizado.
* **Componentes**: Muestra tarjetas agrupadas por fase (Fase 1 a 5) con contadores que diferencian si el instrumento es un formulario externo (`GOOGLE_FORM`) o un documento externo (`GOOGLE_DOC`); la app solo guarda y muestra el enlace.
* **Estados y Progreso**: Clasifica los recursos en *Vigente*, *Borrador* o *Archivado*. Configura cuáles instrumentos son obligatorios, si bloquean el avance de fase del caso, o si requieren validación obligatoria por parte de la coordinación regional.
* **Ubicación en el itinerario**: Para los instrumentos del itinerario secuencial, `InstrumentPlacementEditor` permite reasignar en caliente su etapa (`stageId`) y orden (`order`) dentro de ella — ese orden es el que determina qué actividad ve el PER como paso actual.

#### 4. Auditoría Inmutable de Eventos (`/admin/auditoria`)
* **Función**: Registro cronológico e inalterable de cada mutación de datos clave en la plataforma (creación de casos, asignación de duplas, egresos, retiros forzados, y configuraciones).
* **Auditoría**: Registra el ID de usuario, rol, fecha, acción, dirección IP y los valores previos/nuevos en formato JSON para evidenciar el control técnico ante los auditores de SENDA.

#### 5. Catálogo Nacional de Redes (`/admin/redes`)
* **Función**: vista de solo lectura, consolidada a nivel país, del catálogo de dispositivos territoriales que cada coordinación regional carga desde `/coordinacion/redes`. Sirve como referencia para reportes SENDA y dirección — el alta sigue gestionándose desde cada región, no desde aquí.
* **Componentes**: tabla con filtro por región y conteo de activaciones por dispositivo (`_count.activations`).

---

### B. Vista del Coordinador Técnico Regional (`(coord)/coordinacion`)

Panel de control enfocado en el monitoreo diario de casos, validación metodológica y soporte técnico regional.

#### 0. Resumen Regional (`/coordinacion`)
* **Función**: Tablero de aterrizaje del coordinador. Al cargar la página, ejecuta automáticamente `checkAllAlertRules()` — ya no existe un botón manual "Verificar Atrasos e Inactividad"; las alertas de atraso/inactividad se recalculan solas en cada visita.
* **Componentes**:
  - Indicadores de hitos regionales, casos activos y nómina de preselección.
  - **Personas por estado de ingreso**: Seleccionadas sin PER, Lista de espera y Con PER asignado.
  - **Casos que Requieren Apoyo Metodológico**: panel de alertas abiertas (`Alert.status = "ABIERTA"`) con formulario de nota de resolución (`resolveAlertAction`). Antes vivía en `/coordinacion/alertas`; se movió aquí porque es el mismo tablero donde ya se recalculan.

#### 1. Registro de Ingresos y Preselección de Candidatas (`/coordinacion/candidatas`)
* **Función**: Registrar personas derivadas (`PACandidate`, con nombre o alias en `sourceCenter`), asignarles un PER y ver la lista **Personas acompañadas** (todas, con o sin PER; columnas: persona, PER, estado de ingreso, fecha, acciones). Cada fila tiene un modal **Editar** (`PersonaEditModal`, `updatePersonaAction`, y `deletePersonaAction` → `deletePersona()` para borrar con confirmación por código de caso) sin contraseña: nombre o alias, notas y estado de ingreso si aún no tiene PER; al editar el nombre se actualiza también el alias del caso. El **estado de ingreso** tiene solo dos valores —`SELECCIONADA` y `EN_ESPERA` (lista de espera)— y se cambia desde una lista desplegable por fila (`CandidateStatusSelect`, `updateCandidateStatusAction`), bloqueada una vez que la persona tiene PER (`convertedToCaseId`).
* **Asignar PER — en un solo paso**: el formulario pide solo la persona (únicamente `SELECCIONADA` sin PER; la lista de espera no aparece) y el **PER** activo de la región (el desplegable indica cuántos casos activos lleva; no hay tope). No pide tipo de acompañamiento ni fundamentación: el caso se crea como `NUEVO` y toma como alias el nombre o alias de la persona. `assignPerAction` (componente `AssignPerForm`) no redirige: responde en el mismo formulario con estado de carga y aviso. `createCaseFromCandidate()` crea el caso directo en `matchStatus: "FORMALIZADO"` / `status: "VINCULACION"` y deja listo el primer paso del itinerario; no hay integración con Google. Ya no se exige Acta de Primer Encuentro para formalizar — la validez del match es responsabilidad de Dirección/Coordinación, no un archivo externo que la app deba verificar.

#### 2. Acompañamientos y validación del itinerario (`/coordinacion/casos`)
* **Funcionamiento**: Ficha de caso con timeline metodológico (cambios de fase, registros de acompañamiento y eventos de tareas) más el componente `ItineraryValidationPanel`, que muestra el paso actual del itinerario que el PER envió y permite **"✅ Validar"**, **"❌ Devolver"** (con observación obligatoria) o **"Marcar como resuelto (no aplica)…"** (con motivo obligatorio — llama a `markStepNotApplicableAction`, deja el instrumento en `NO_APLICA`, que satisface el gate igual que `VALIDADA` sin forzar toda la etapa).
* **Avance de Fase**: `StageAdvanceButton` habilita el botón de transición (`VINCULACION` $\rightarrow$ `CONEXION` $\rightarrow$ `FINALIZACION` $\rightarrow$ `EGRESO`) solo cuando `assertStageAdvanceAllowed()` confirma que todos los instrumentos con `countsTowardStageGate: true` de la etapa actual están `VALIDADA` o `NO_APLICA`. Si falta alguno, muestra la lista de pendientes y un botón de **"Forzar avance de etapa"** que exige un motivo escrito y queda auditado.
* **Validación de Bloqueos (Egreso)**: El gate de la etapa Finalización exige *Actividad 5 (Final)*, *Actividad 6* y la *Encuesta de Satisfacción* validadas. En caso de omisión, despliega un banner de advertencia contextual: *«Requisito Metodológico del Convenio»*.
* **Retiro Voluntario y Deserción**: `WithdrawalModal` (botón + modal; contiene `WithdrawalGate` y **Cancelar retiro** → `cancelWithdrawalAction` / `cancelWithdrawal()`) habilita bajo demanda el Formulario de Abandono correspondiente (persona acompañada o PER) — un instrumento más del catálogo con `triggerCondition: "ON_WITHDRAWAL"` — que debe completarse y validarse antes de cerrar el caso (el PER lo completa desde un modal que solo aparece con el retiro iniciado). Ya no exige un mínimo de intentos de contacto: ese gate (`logContactAttempt`, nunca invocado desde ningún flujo real) se quitó por no ser parte de las métricas del convenio SENDA.

* **Reasignar Acompañante**: tarjeta visible en cualquier caso no cerrado. `reassignCaseAction` → `reassignCase()` cambia el PER a cargo (validando que esté activo y sea de la misma región), audita `REASSIGN_CASE` y notifica a ambos. Es el CRUD de excepción para corregir una dupla ya formalizada, ahora que el match no pasa por un estado intermedio revisable.

#### 3. Dotación PER y Supervisiones (`/coordinacion/supervisiones`)
* **Función**: Monitorea el cumplimiento metodológico del pilotaje (frecuencia de supervisión técnica).
* **Componentes**:
  - **Listado de PER**: Registro de acompañantes regionales, su estado (*Activo* / *Inactivo*, de solo lectura) y si tienen o no un acompañamiento activo. El estado se cambia solo desde `/admin/usuarios`.
  - **Umbrales de alerta**: 15 días sin supervisión → amarillo, 30 días → rojo. Constantes en `SUPERVISION_ALERT_DAYS` (`src/lib/program-config.ts`).
  - **Supervisión Técnica**: Formulario para registrar las reuniones semanales obligatorias de supervisión de dupla. Registra la reunión y notifica al PER.

#### 4. Gestión de Redes e Integración Social (`/coordinacion/redes`)
* **Función**: Catálogo de dispositivos y mapa de actores territoriales activos para derivaciones e integración de Fase 5. Alta y baja de dispositivos por región — el coordinador es quien descubre en terreno qué actor falta cargar, así que el alta se mantiene aquí (no en admin).
* **Componentes**:
  - **Dispositivos Territoriales**: Registro de instituciones y redes locales (Salud, Empleo, Educación, Habitabilidad, etc.) con sus personas de contacto, con formulario de alta (`registerNetworkDeviceAction`).
  - **Activación de Red**: Bitácora de derivaciones que asocia un caso con un dispositivo de la red territorial, registrando el informe de vinculación social.
  - **Actividades Grupales**: Registro de encuentros de equipos, Focus Groups regionales y Open Spaces de Fase 5.
  - Existe además una vista nacional de solo lectura en `/admin/redes` (ver sección A.5), consolidada para reportes SENDA y dirección.

#### 5. Bandeja de Validación (`/coordinacion/alertas`)
* **Función**: bandeja única para "lo que el PER envió y espera revisión" — antes eran dos ítems de menú separados (`/coordinacion/sesiones` y la mitad de `/coordinacion/alertas`); ahora es un solo gesto.
* **Componentes**:
  - **Registros de Acompañamiento Pendientes** (`SessionValidationQueue`): tarjetas de vista previa de `SessionLog` en estado `ENVIADA`; al hacer clic se abre un modal con el detalle completo (Fecha, Modalidad, Ámbito, Objetivo, Emoción, Descripción, Reflexión del PER) y las acciones de Aprobar/Devolver. Si una notificación trae `?highlightSessionId=`, el modal se abre solo al cargar la página.
  - **Hitos y Entregables en Espera de Validación**: hitos documentales enviados por los PER (IAP, Evaluaciones Intermedia/Ex-Post, etc.) pendientes de aprobación — el mismo bloque que antes vivía aquí.
  - Las alertas de inactividad (Caso sin sesión, Tarea atrasada, Instrumento pendiente de validación, Etapa estancada) ya no se disparan desde un botón en esta página: se recalculan automáticamente al cargar `/coordinacion` (ver sección 0) y se resuelven desde el panel "Casos que Requieren Apoyo Metodológico" ahí mismo.

---

### C. Vista del Par Especialista en Recuperación (`(per)/per`)

Aplicación móvil PWA (diseño de un toque y carga veloz) pensada para el trabajo en terreno de los acompañantes PER. Navegación fija de **2 pestañas**: **Mi Agenda** (`/per`) y **Avisos** (`/per/avisos`). Lo habitual es que un PER lleve un solo acompañamiento: en ese caso `/per` lo lleva directo a su itinerario, por eso no existe una pestaña ni ruta "Casos Activos". Si lleva más de uno, `/per` muestra la lista para elegir (alias y código).

#### 1. Mi Agenda
* **Función**: `/per` resuelve directo a la etapa del único caso activo del PER (`redirect`) o muestra el estado vacío "No tienes un acompañamiento activo asignado" si no tiene ninguno. Las notificaciones que traen `?highlightCaseId=` o `?highlightSessionId=` se resuelven aquí mismo al caso correspondiente antes de redirigir, para no perder el destino aunque el PER tenga cero o un caso.

#### 2. Itinerario del caso (`/per/casos/[caseId]/etapa`)
* **Función**: `StageItineraryBoard` muestra los pasos completados (colapsables), el paso actual (con su formulario) y los próximos (bloqueados, solo título). `ensureCurrentStageTasks()` en el servidor garantiza que solo exista materializada la `Task` del siguiente paso pendiente — nunca toda la etapa de una vez.
* **`NativeInstrumentForm`**: renderiza los formularios nativos del itinerario (Primer Encuentro, Actividad 1-6) a partir de los campos definidos en `instrument-itinerary.ts`; soporta agrupación visual por `section` (usado en Actividad 2, que agrupa 13 preguntas en 5 secciones).
* **`ActivityHistoryViewer`** (`components/shared/`): visor de historial del caso para PER y coordinación. Etapa → actividad → **Cargar** abre un modal con el contenido (`renderInstrumentContent`) y los eventos de estado por rol (nunca nombres). El PER puede **editar** (`submitItineraryStep` acepta enviadas y validadas: la validada vuelve a `ENVIADA` y se audita `EDIT_ITINERARY_STEP` con las claves cambiadas, sin texto). Coordinación puede **corregir una validación** (`reopenValidation`: `REVIEW` → `ENVIADA`, `REQUEST_EDIT` → `DEVUELTA` con aviso al PER; audita `REOPEN_VALIDATION`). Datos: `getCaseActivityHistory`.
* **Reinicio del modo demo** (`server/services/demo.service.ts`): `ensureDemoWindow` se evalúa en `getCurrentUser` solo con sesión demo (una vez por petición, vía `cache`). Ventana de `DEMO_WINDOW_MINUTES` (5) guardada en `Setting.demo_window_started_at`; al vencer, un `updateMany` condicional "toma" la ventana (una sola petición reinicia) y `resetDemoData` borra y reinserta lo demo en una transacción. El alcance se deduce del esquema: filas `isDemo = 1` y las que cuelgan de ellas por clave foránea (`demoScope`); `Setting` queda fuera y lo real no se toca. La foto de referencia vive en `Setting.demo_baseline` (JSON) y se guarda con `scripts/demo-linea-base.ts` (`--guardar`, y `--confirmar-produccion` contra Turso; `--quitar` apaga el reinicio). Sin línea base el reinicio no actúa. Un fallo deshace la transacción y devuelve la ventana para reintentar en el siguiente clic.
* **Historia de los casos demo** (`server/services/demo-history.service.ts`, contenido en `lib/demo-content.ts`, CLI `scripts/demo-historial.ts`): completa las actividades anteriores a la que cada caso demo ya tiene (todo el itinerario si está `EGRESO`) enviándolas con contenido inventado (`submitItineraryStep` como el PER) y validándolas (`updateTaskStatus` como coordinación), con fechas repartidas semana a semana hacia atrás. Solo toca casos `isDemo = 1` y aborta si una tarea del caso no lo es. Por defecto solo muestra el plan; `--aplicar` escribe (y `--confirmar-produccion` contra Turso). Es idempotente. Después de aplicarlo se guarda la línea base del reinicio.
* **`ActivityModal`** (`components/shared/`): modal único de una actividad (Ver = solo lectura; Editar = formulario). Lo usan `ActivityHistoryViewer` y `CaseTimeline` (historial cronológico de coordinación, con menú ⋮ por hito). Coordinación/admin guardan con `editItineraryStepAsStaffAction` → `submitItineraryStep` (solo `ENVIADA`/`VALIDADA` de su región; queda `ENVIADA`, audita `EDIT_ITINERARY_STEP` con `role` y avisa al PER). `RowActionsMenu` (`components/shared/`) es el menú de tres puntos verticales para las acciones de fila (historial, Personas acompañadas, Usuarios PER, Acompañamientos de admin).
* **Actividad 4 reformulada**: `isPlanSuperseded` (la tarea `REFORMULAR_ACTIVIDAD_4` ya tiene contenido enviado) bloquea editar, reabrir o devolver la Actividad 4 original; `ActivityHistoryItem.superseded` lo expone a la UI.
* **Etapa anterior reabierta**: `getItineraryState` antepone las actividades reabiertas de otras etapas (`stage` en cada paso) y `assertStageAdvanceAllowed` las cuenta como faltantes.
* **Pedir una corrección** (`requestCorrection`, acción `requestCorrectionAction`): coordinación de la región o el administrador devuelve al PER una actividad `ENVIADA` (devolución normal) o `VALIDADA` (edición solicitada, rosa) con un texto obligatorio; avisa al PER y el texto se muestra dentro de la actividad. El administrador la usa desde `/admin/casos` (todas las regiones), con el mismo `ActivityHistoryViewer`.
* **Edición solicitada**: una actividad "reabierta" es la que tiene un `TaskEvent` con `fromStatus = VALIDADA`; `getItineraryState` la marca `reopened` y `StageItineraryBoard` la muestra en rosa antes de la actividad activa.
* **Prioridad y semana (Actividades 3 y 4)**: `lib/priority.ts` define Alta/Media/Baja (`IAPDomainMap.importance` sigue guardando `ALTO/MEDIO/BAJO`). La Actividad 3 guarda además la `date` en el contenido de la tarea. La Actividad 4 guarda `IAPGoal.targetWeek` (1–`MAX_PLAN_WEEK`); `IAPGoal.deadline` quedó como dato legado. `saveGoals` actualiza por id y nunca duplica objetivos: un objetivo quitado que ya tiene registros de acompañamiento se retira (`isCurrent: false`) en vez de borrarse.
* **`RegistroAcompanamientoForm`**: formulario recurrente de la etapa Conexión (uno por encuentro, no un paso único). El selector de Objetivo se llena con `getCurrentGoalsForCase()`, que trae los `IAPGoal` vigentes (`isCurrent: true`) definidos en la Actividad 4. Sigue escribiendo al modelo `SessionLog`.
* **`ExternalLinkStepForm`**: para instrumentos con `submissionMode: "EXTERNAL_LINK"` (ej. Encuesta de Satisfacción), donde el PER pega la URL del documento en vez de llenar un formulario nativo.
* **Funcionamiento Offline**: ambos tipos de formulario almacenan borradores en `localStorage` si no hay internet, y los sincronizan con un toque al recuperar conectividad.
