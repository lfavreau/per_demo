# Estructura del Proyecto y Secciones de la Aplicación

Este documento detalla la arquitectura técnica, la distribución de directorios, los principales archivos de código y las especificaciones funcionales de cada una de las vistas de la **Plataforma de Coordinación PER 2026-2027**.

---

## 1. Arquitectura y Estructura de Directorios

El proyecto está construido sobre **Next.js (App Router)** utilizando la versión 16, TypeScript, Tailwind CSS para estilos, y **Prisma ORM** interactuando con SQLite (en desarrollo/testing local) y PostgreSQL en producción.

```
/
├── prisma/
│   ├── schema.prisma         # Definición de modelos de base de datos (PostgreSQL/SQLite)
│   └── seed.ts               # Semillas oficiales con datos realistas para el pilotaje
├── public/
│   ├── manifest.json         # Configuración del PWA (Standalone, colores, iconos)
│   └── sw.js                 # Service Worker (Caché offline y recibidor de notificaciones push)
└── src/
    ├── app/                  # Enrutamiento de la aplicación (App Router Groups por Rol)
    │   ├── (admin)/admin     # Panel y secciones del Súper Administrador
    │   ├── (auth)/login      # Control de acceso y sesiones
    │   ├── (coord)/coor...   # Panel y flujos del Coordinador Técnico Regional
    │   ├── (per)/per         # Panel móvil y bitácoras del Par Especialista (PER)
    │   ├── actions/          # Acciones del Servidor (Server Actions para mutación de datos)
    │   └── api/push          # Endpoints para suscripción de notificaciones push
    ├── components/           # Componentes UI reutilizables y persistentes
    │   ├── shell/AppShell.tsx # Contenedor principal con menús responsivos y campana de avisos
    │   └── PWARegistration.tsx# Registrador del Service Worker e iniciador de suscripciones push
    ├── lib/                  # Utilidades globales (Base de datos, Autenticación y Nomenclaturas)
    └── server/services/      # Servicios del backend (Lógica de negocio, base de datos y push)
```

---

## 2. Archivos Principales y Funciones

* **[schema.prisma](file:///c:/Users/admn/Desktop/apps/per/alpha/prisma/schema.prisma)**: Define el modelo relacional del pilotaje. Incluye tablas clave para la auditoría y control técnico: `PACase` (casos de personas acompañadas), `PERProfile` (perfil del acompañante PER), `SessionLog` (bitácoras de sesión), `Task` (hitos documentales de la carpeta Drive), `Supervision` (minutas de supervisiones individuales de dupla) y `PushSubscription` (tokens de push).
* **[AppShell.tsx](file:///c:/Users/admn/Desktop/apps/per/alpha/src/components/shell/AppShell.tsx)**: Componente envolvente principal de la UI. Implementa:
  - Control de estado de conexión (*Banner Offline* automático).
  - Campana de avisos in-app con polling reactivo de 15 segundos, insignia de pendientes y animación interactiva (tiembla 3 veces al recibir avisos nuevos).
  - Redireccionamiento interactivo y efecto de destello temporizado de 2.5s (`animate-highlight`) al consultar recursos.
  - Menú hamburguesa responsivo y cajón lateral deslizante (`animate-slide-in-left`) en móviles para roles administrativos.
  - Banner de suscripción a notificaciones push a nivel de dispositivo (opt-in integrado con el Service Worker).
* **[push.service.ts](file:///c:/Users/admn/Desktop/apps/per/alpha/src/server/services/push.service.ts)**: Administra el ciclo de vida de los avisos Web Push. El helper `createNotificationWithPush()` unifica la creación del registro en base de datos y la transmisión de carga útil cifrada (payload) a los dispositivos suscritos de forma no bloqueante mediante `setImmediate`.
* **[sw.js](file:///c:/Users/admn/Desktop/apps/per/alpha/public/sw.js)**: Service Worker encargado de almacenar en caché los activos estáticos para el funcionamiento sin conexión a internet y escuchar el evento `push` del navegador para disparar la alerta nativa del dispositivo, redirigiendo al usuario a la vista exacta al hacer clic.
* **[GoogleAppsScript.gs](file:///c:/Users/admn/Desktop/apps/per/alpha/GoogleAppsScript.gs)**: Código de Google Apps Script listo para ser copiado en el editor de Apps Script. Configura las llamadas de creación de jerarquías de Drive, copias de plantillas IAP, agendamientos de Calendar y sincronización de Google Sheets.
* **[workspace.ts](file:///c:/Users/admn/Desktop/apps/per/alpha/src/server/google/workspace.ts)**: Administrador de la integración con Workspace. De forma dinámica, llama a la Web App de Google Apps Script si está la variable de entorno `GOOGLE_APPS_SCRIPT_URL`, o realiza la simulación simulada (mock) local en caso contrario.

---

## 3. Secciones Metodológicas Detalladas por Rol

La plataforma implementa un estricto control de acceso basado en roles (RBAC) y filtrado por región para proteger la privacidad de los metadatos de las personas acompañadas.

### A. Vista del Súper Administrador Nacional (`(admin)/admin`)

Panel de control centralizado enfocado en la transparencia, auditoría y control presupuestario para la liberación de remesas.

#### 1. Consola de KPIs y Reportes Oficiales (`/admin/reportes`)
* **Función**: Panel cuantitativo que calcula y muestra las **8 métricas críticas del convenio** exigidas por SENDA (adherencia $\ge 3$ meses, tasa del 60% de casos nuevos, evaluación ex-ante/ex-post completadas al 80%, entre otros).
* **Filtros e Historial**: Permite desagregar las estadísticas por región, sexo/género, rango etario, nivel de estudios y situación laboral.
* **Congelamiento de Snapshots**: Botón para "congelar" y almacenar reportes inmutables para un periodo determinado. Genera un registro histórico del reporte oficial y emite notificaciones push a los coordinadores regionales.

#### 2. Catálogo de Instrumentos del PER (`/admin/instrumentos`)
* **Función**: Catálogo oficial de herramientas y encuestas vigentes que guían el itinerario de acompañamiento personalizado.
* **Componentes**: Muestra tarjetas agrupadas por fase (Fase 1 a 5) con contadores que diferencian si el instrumento es un documento colaborativo en Drive (`GOOGLE_DOC`) o un formulario de entrada (`GOOGLE_FORM`).
* **Estados y Progreso**: Clasifica los recursos en *Vigente*, *Borrador* o *Archivado*. Configura cuáles instrumentos son obligatorios, si bloquean el avance de fase del caso, o si requieren validación obligatoria por parte de la coordinación regional.

#### 3. Auditoría Inmutable de Eventos (`/admin/auditoria`)
* **Función**: Registro cronológico e inalterable de cada mutación de datos clave en la plataforma (creación de casos, asignación de duplas, egresos, retiros forzados, y configuraciones).
* **Auditoría**: Registra el ID de usuario, rol, fecha, acción, dirección IP y los valores previos/nuevos en formato JSON para evidenciar el control técnico ante los auditores de SENDA.

---

### B. Vista del Coordinador Técnico Regional (`(coord)/coordinacion`)

Panel de control enfocado en el monitoreo diario de casos, validación metodológica y soporte técnico regional.

#### 1. Nómina y Preselección de Candidatas (`/coordinacion/candidatas`)
* **Función**: Control del funnel de Fase 2 para el ingreso de personas acompañadas.
* **Componentes**: Muestra el funnel metodológico interactivo a través de sus **7 estados oficiales** (Derivada $\rightarrow$ Contactada $\rightarrow$ Preinscrita $\rightarrow$ Entrevistada $\rightarrow$ Admisible $\rightarrow$ Seleccionada $\rightarrow$ En espera).
* **Conformación de Duplas**: Formulario para asignar a una candidata admisible con un acompañante PER habilitado en la región, ingresando la fundamentación técnica que justifica el match de la dupla.

#### 2. Bitácora de Casos y Acompañamientos (`/coordinacion/casos`)
* **Funcionamiento**: Timeline metodológico que reúne la historia del caso en orden cronológico (sesiones individuales, tareas enviadas, intentos de contacto y tránsitos de fase).
* **Avance de Fase**: Botones condicionales para transicionar el caso entre las fases metodológicas (`VINCULACION` $\rightarrow$ `CONEXION` $\rightarrow$ `FINALIZACION` $\rightarrow$ `EGRESO`).
* **Validación de Bloqueos (Egreso)**: Control que impide egresar un caso si no se ha validado su *Evaluación Ex-Post* y la *Encuesta de Satisfacción*. En caso de omisión, despliega un banner de advertencia contextual: *«Requisito Metodológico del Convenio»*.
* **Retiro Voluntario y Deserción**: Permite registrar el abandono del caso (congelando su historial y liberando el cupo del PER en la región). Exige al menos 3 intentos de contacto registrados previamente en la base de datos antes de permitir marcar deserción voluntaria.

#### 3. Validación de Sesiones (`/coordinacion/sesiones`)
* **Función**: Bandeja de entrada y revisión metodológica de las bitácoras de encuentro enviadas por los PER.
* **Componentes**:
  - **Bandeja de Entrada**: Tarjetas de vista previa responsiva con resumen de bitácoras en estado `ENVIADA`.
  - **Modal de Detalle Completo**: Al hacer clic en una tarjeta, se abre una ventana modal con todos los campos del formulario (Fecha, Asistencia, Modalidad, Ámbito IAP, Duración, Emoción, Resumen, Acuerdos, Dificultades, Acciones y Reflexión del PER).
  - **Acciones y Retroalimentación**: Permite aprobar la bitácora directamente o escribir comentarios de observación en un campo dedicado y devolverla al PER en el pie del mismo modal.

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
  - **Alertas de Inactividad**: Alertas automáticas gatilladas por el sistema si una dupla registra inactividad metodológica (sin bitácoras) durante 14 días.

---

### C. Vista del Par Especialista en Recuperación (`(per)/per`)

Aplicación móvil PWA (diseño de un toque y carga veloz) pensada para el trabajo en terreno de los acompañantes PER.

#### 1. Panel de Mis Casos Asignados
* **Función**: Lista simplificada de los acompañamientos activos asignados a su dupla PER. Permite ingresar al historial y registrar nuevos eventos con un toque.

#### 2. Registro de Bitácora de Acompañamiento
* **Función**: Formulario ágil para documentar cada encuentro individual (duración, modalidad, resumen técnico, acuerdos, dificultades, escala emocional con 4 caritas y reflexión personal).
* **Funcionamiento Offline**: Almacena automáticamente los borradores en `localStorage` si no hay internet, permitiendo al PER sincronizarlos con la base de datos central en la nube una vez que recupera conectividad.

#### 3. Agenda de Tareas y Pendientes
* **Función**: Checklist de hitos documentales requeridos para el avance de sus casos asignados.
* **Envío de Evidencias**: Permite al PER ingresar el enlace del documento de Drive correspondiente a la tarea (por ejemplo, el PDF del IAP firmado o la Encuesta de Satisfacción) y enviarlo a revisión del coordinador.
