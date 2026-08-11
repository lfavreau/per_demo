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
* **[GoogleAppsScript.gs](GoogleAppsScript.gs)**: Código de Google Apps Script listo para ser copiado en el editor de Apps Script. Configura las llamadas de creación de jerarquías de Drive, copias de plantillas IAP, agendamientos de Calendar y sincronización de Google Sheets.
* **[workspace.ts](src/server/google/workspace.ts)**: Administrador de la integración con Workspace. De forma dinámica, llama a la Web App de Google Apps Script si está la variable de entorno `GOOGLE_APPS_SCRIPT_URL`, o realiza la simulación simulada (mock) local en caso contrario.

---

## 3. Secciones Metodológicas Detalladas por Rol

La plataforma implementa un estricto control de acceso basado en roles (RBAC) y filtrado por región para proteger la privacidad de los metadatos de las personas acompañadas.

### A. Vista del Súper Administrador Nacional (`(admin)/admin`)

Panel de control centralizado enfocado en la transparencia, auditoría y control presupuestario para la liberación de remesas.

#### 1. Gestión de Usuarios (`/admin/usuarios`)
* **Función**: Alta, edición, baja y activación/desactivación de las cuentas de Acompañantes PER. Muestra por separado la nómina de PER (editable) y la de los 5 Coordinadores Regionales (fijos).
* **Crear**: Formulario con nombre, usuario y coordinación regional asignada; genera el correo institucional `usuario@per2026.cl` automáticamente. El PER nace **`HABILITADO`** — se asume que la contratación y el criterio de habilitación ya se resolvieron en la reunión de coordinación, fuera de la app; la app solo deja constancia.
* **Habilitación**: selector inline por fila (Habilitado / Pendiente / No Habilitado, `updatePerStatusAction`) — se usa como excepción para suspender a alguien, no como paso obligatorio de alta. Es exclusivo de Admin desde este cambio; el coordinador ve el estado pero no puede modificarlo (ver `/coordinacion/supervisiones`).
* **Editar / Eliminar**: Ambas acciones abren un modal que exige la **contraseña compartida de modo real** (`verifyRealModePassword()` en `src/lib/auth.ts`) antes de aplicar el cambio. La eliminación se bloquea a nivel de servidor (`src/app/actions/admin.ts`) si el PER tiene algún `PACase` asociado, para no dejar casos huérfanos.
* **Auditoría**: Creación, edición y eliminación quedan registradas como `CREACION_USUARIO_PER` / `EDICION_USUARIO_PER` / `ELIMINACION_USUARIO_PER` en `AuditLog`; los cambios de habilitación como `HABILITACION_PER` / `SUSPENSION_PER`.

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
  - **Distribución del Embudo de Preselección**: los **9 estados oficiales** de `PACandidate` (Derivada, Contactada, Preinscrita, Entrevistada, Admisible, No Admisible, Seleccionada, En espera, Descartada), con conteos reales — cada uno alcanzable desde la nómina, no solo valores de siembra.
  - **Casos que Requieren Apoyo Metodológico**: panel de alertas abiertas (`Alert.status = "ABIERTA"`) con formulario de nota de resolución (`resolveAlertAction`). Antes vivía en `/coordinacion/alertas`; se movió aquí porque es el mismo tablero donde ya se recalculan.

#### 1. Nómina y Preselección de Candidatas (`/coordinacion/candidatas`)
* **Función**: Control del funnel de Fase 2 para el ingreso de personas acompañadas. La tabla lista **toda** la nómina (no solo los estados aptos para match); cada fila tiene un selector de estado editable en un clic (`CandidateStatusSelect`, `updateCandidateStatusAction`) que se bloquea una vez que la persona fue convertida a caso (`convertedToCaseId`).
* **Conformación de Duplas — match en un solo paso**: el formulario pide candidata (solo `SELECCIONADA`/`ADMISIBLE`), **PER disponible** (el desplegable ya excluye a quien tenga un acompañamiento activo — tope de 1 caso por PER, `MAX_ACTIVE_CASES_PER_PER` en `src/lib/program-config.ts`) y fundamentación. Al enviar, `createCaseFromCandidate()` aprovisiona la carpeta de Drive y el IAP, y crea el caso directo en `matchStatus: "FORMALIZADO"` / `status: "VINCULACION"` — ya no existen los pasos intermedios `PROPUESTO` → `VALIDADO` que exigían dos clics de coordinación. Si el aprovisionamiento en Drive falla, no se escribe nada en la base: el coordinador reintenta el mismo formulario. Ya no se exige Acta de Primer Encuentro para formalizar — la validez del match es responsabilidad de Dirección/Coordinación, no un archivo externo que la app deba verificar (`copyActaPrimerEncuentro` quedó sin uso en `workspace.ts`).

#### 2. Acompañamientos y validación del itinerario (`/coordinacion/casos`)
* **Funcionamiento**: Ficha de caso con timeline metodológico (cambios de fase, registros de acompañamiento y eventos de tareas) más el componente `ItineraryValidationPanel`, que muestra el paso actual del itinerario que el PER envió y permite **"✅ Validar"**, **"❌ Devolver"** (con observación obligatoria) o **"Marcar como resuelto (no aplica)…"** (con motivo obligatorio — llama a `markStepNotApplicableAction`, deja el instrumento en `NO_APLICA`, que satisface el gate igual que `VALIDADA` sin forzar toda la etapa).
* **Avance de Fase**: `StageAdvanceButton` habilita el botón de transición (`VINCULACION` $\rightarrow$ `CONEXION` $\rightarrow$ `FINALIZACION` $\rightarrow$ `EGRESO`) solo cuando `assertStageAdvanceAllowed()` confirma que todos los instrumentos con `countsTowardStageGate: true` de la etapa actual están `VALIDADA` o `NO_APLICA`. Si falta alguno, muestra la lista de pendientes y un botón de **"Forzar avance de etapa"** que exige un motivo escrito y queda auditado.
* **Validación de Bloqueos (Egreso)**: El gate de la etapa Finalización exige *Actividad 5 (Final)*, *Actividad 6* y la *Encuesta de Satisfacción* validadas. En caso de omisión, despliega un banner de advertencia contextual: *«Requisito Metodológico del Convenio»*.
* **Retiro Voluntario y Deserción**: `WithdrawalGate` habilita bajo demanda el Formulario de Abandono correspondiente (persona acompañada o PER) — un instrumento más del catálogo con `triggerCondition: "ON_WITHDRAWAL"` — que debe completarse y validarse antes de cerrar el caso. Ya no exige un mínimo de intentos de contacto: ese gate (`logContactAttempt`, nunca invocado desde ningún flujo real) se quitó por no ser parte de las métricas del convenio SENDA.
* **Documentos generados en Drive**: al validar un instrumento nativo, `document-sync.service.ts` arma el documento oficial en la carpeta de la etapa desde la plantilla de Apps Script correspondiente (`TEMPLATE_DOC_{activityKey}`). Se dispara al cerrar etapa (`syncPendingCaseDocuments`, fuera de la transacción de `transitionCaseStatus`) o vía el botón de forzado en `/admin`. Correcciones reescriben el mismo archivo (mismo `fileId`, revisión de Drive nueva) en vez de crear copias `_v1`/`_v2`. El IAP reutiliza el archivo ya provisionado al formalizar (`IAPRecord.driveDocId`) y se revisa en cualquier cierre de etapa, no solo al salir de Vinculación, porque `REFORMULAR_ACTIVIDAD_4` (etapa Conexión) puede cambiar su contenido.
* **Reasignar Acompañante**: tarjeta visible en cualquier caso no cerrado. `reassignCaseAction` → `reassignCase()` cambia el PER a cargo (validando tope de 1 caso, habilitación y misma región), libera el cupo del PER anterior, audita `REASSIGN_CASE` y notifica a ambos. Es el CRUD de excepción para corregir una dupla ya formalizada, ahora que el match no pasa por un estado intermedio revisable.

#### 3. Dotación PER y Supervisiones (`/coordinacion/supervisiones`)
* **Función**: Monitorea el cumplimiento metodológico del pilotaje (frecuencia de supervisión técnica).
* **Componentes**:
  - **Listado de PER**: Registro de acompañantes regionales, su estado real de habilitación (*Habilitado* / *Pendiente* / *No Habilitado*, de solo lectura) y si tienen o no un acompañamiento activo. **La habilitación/suspensión ya no se gestiona desde aquí** — es de solo lectura, con una nota que apunta a `/admin/usuarios`. El coordinador no vuelve a decidir sobre certificación PER; esa decisión se toma en la reunión de coordinación y se registra en admin.
  - **Umbrales de alerta**: 15 días sin supervisión → amarillo, 30 días → rojo. Constantes en `SUPERVISION_ALERT_DAYS` (`src/lib/program-config.ts`).
  - **Supervisión Técnica**: Formulario para registrar las reuniones semanales obligatorias de supervisión de dupla. Genera automáticamente una cita de reunión y enlace de Google Meet mediante la API de Google Calendar y notifica al PER.

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

Aplicación móvil PWA (diseño de un toque y carga veloz) pensada para el trabajo en terreno de los acompañantes PER. Navegación fija de **2 pestañas**: **Mi Agenda** (`/per`) y **Avisos** (`/per/avisos`). Un PER lleva como máximo un acompañamiento activo a la vez (`MAX_ACTIVE_CASES_PER_PER` en `src/lib/program-config.ts`), así que ya no existe una pestaña ni ruta "Casos Activos" — con tope 1 esa lista nunca tendría más de un elemento.

#### 1. Mi Agenda
* **Función**: `/per` resuelve directo a la etapa del único caso activo del PER (`redirect`) o muestra el estado vacío "No tienes un acompañamiento activo asignado" si no tiene ninguno. Las notificaciones que traen `?highlightCaseId=` o `?highlightSessionId=` se resuelven aquí mismo al caso correspondiente antes de redirigir, para no perder el destino aunque el PER tenga cero o un caso.

#### 2. Itinerario del caso (`/per/casos/[caseId]/etapa`)
* **Función**: `StageItineraryBoard` muestra los pasos completados (colapsables), el paso actual (con su formulario) y los próximos (bloqueados, solo título). `ensureCurrentStageTasks()` en el servidor garantiza que solo exista materializada la `Task` del siguiente paso pendiente — nunca toda la etapa de una vez.
* **`NativeInstrumentForm`**: renderiza los formularios nativos del itinerario (Primer Encuentro, Actividad 1-6) a partir de los campos definidos en `instrument-itinerary.ts`; soporta agrupación visual por `section` (usado en Actividad 2, que agrupa 13 preguntas en 5 secciones).
* **`RegistroAcompanamientoForm`**: formulario recurrente de la etapa Conexión (uno por encuentro, no un paso único). El selector de Objetivo se llena con `getCurrentGoalsForCase()`, que trae los `IAPGoal` vigentes (`isCurrent: true`) definidos en la Actividad 4. Sigue escribiendo al modelo `SessionLog`.
* **`ExternalLinkStepForm`**: para instrumentos con `submissionMode: "EXTERNAL_LINK"` (ej. Encuesta de Satisfacción), donde el PER pega la URL del documento en vez de llenar un formulario nativo.
* **Funcionamiento Offline**: ambos tipos de formulario almacenan borradores en `localStorage` si no hay internet, y los sincronizan con un toque al recuperar conectividad.
