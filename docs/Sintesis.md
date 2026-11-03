# Síntesis — Programa PER y Plataforma de Coordinación 2026-2027

> Punteo de presentación. Fusiona Manual, Guía, Estructura, Resumen, README y guía de despliegue.
> Programa: Pilotaje de Recuperación Basada en Pares (PER) — SENDA / AVANZA Inclusión — Res. Ex. N° 567. Plataforma en etapa **beta**.

---

## 1. En una frase

- **Programa PER**: personas con recuperación sostenida (PER) acompañan a otras en su integración social. No clínico, horizontal, basado en experiencia compartida.
- **App**: PWA que coordina, hace seguimiento y deja trazabilidad del pilotaje sobre Google Workspace. No reemplaza los documentos oficiales: los ordena, los vuelve tareas, avisa y mide.
- **Uso en beta**: la usa sobre todo el PER para registrar sesiones, avances de etapa y actividades. Contactos, coordinaciones y derivaciones siguen siendo mayormente manuales, fuera de la app.
- **Relación habitual**: 1 PER por persona acompañada; más de una solo en casos puntuales.

---

## 2. El Programa PER

### Actores
| Actor | Rol |
|---|---|
| **PER** — Par Especialista en Recuperación | Acompaña, escucha, co-construye el IAP, registra bitácoras, se supervisa |
| **PA** — Persona Acompañada | Dirige su propio proceso |
| **Dupla** | PER + PA |
| **Coordinador/a Regional** | Supervisa PER, valida entregas, arma duplas, gestiona alertas |
| **Administrador Nacional** | KPIs, usuarios (alta y deshabilitación de PER), instrumentos, auditoría, reportes SENDA |

### Qué NO hace un PER
- No reemplaza terapia, no diagnostica ni prescribe.
- No crea dependencia, no comparte información confidencial, no actúa fuera del programa.

### Principios
Orientado a la recuperación · Centrado en la persona · Voluntario · Foco en la relación · Informado en trauma · Inclusivo · Acepta el error · Mutualidad.

### Cobertura: 5 regiones, 49 cupos
| Región | Cupos |
|---|---|
| Metropolitana | 20 |
| Los Ríos | 11 |
| Valparaíso | 8 |
| Tarapacá | 6 |
| Biobío | 4 |

### 5 Fases
| Fase | Qué ocurre |
|---|---|
| **1. Preparación y habilitación** | Inducción y Código de Ética (fuera de la app), caracterización, alta de la cuenta PER |
| **2. Admisibilidad e ingreso** | Funnel: Derivada → Contactada → Preinscrita → Entrevistada → Admisible → Seleccionada → En espera (+ No admisible / Descartada) |
| **3. Conformación de duplas** | Match PER-PA con fundamentación, Acta de Primer Encuentro, encuadre |
| **4. Acompañamiento** | 3 etapas (abajo), IAP, bitácoras, redes |
| **5. Evaluación y sistematización** | Encuestas, focus groups, informes de brechas, retiros/deserciones, informe a SENDA |

### Fase 4 — 3 etapas (≈ 9 meses)
| Etapa | Duración | Frecuencia | Producto |
|---|---|---|---|
| **Vinculación** | ~1 mes | ≥ 1/semana | Vínculo + IAP co-construido |
| **Conexión** | ~6 meses | 1–2/semana | Ejecución IAP, bitácoras, activación de redes (CESFAM, OMIL…) |
| **Finalización** | ~2 meses | ≥ 1/semana | Evaluación Ex-Post + Encuesta de Satisfacción → Egreso |

### IAP — Itinerario de Acompañamiento Personalizado
- Hoja de ruta co-construida PER + PA: ámbitos priorizados, objetivos, actividades, recursos, plazos, evaluaciones.
- Personalizado, flexible, co-construido, orientado a la acción.
- Cronograma orientativo (25 sesiones): 1–3 exploración · 4–5 recursos/necesidades · 6–7 objetivos · 8 acciones · 9–20 acompañamiento · 21–25 evaluación y cierre.

### 9 Ámbitos de recuperación
Apoyo social · Ciudadanía · Tiempo libre · Empleo · Situación judicial · Educación y formación · Habitabilidad · Situación financiera · Salud física y mental.

### Herramientas metodológicas
- **Mapeo** (Mapas 0–6): competencias, motivación, recursos/necesidades, objetivos, actividades, seguimiento, ajustes.
- **Competencias Mapa 0**: Comunicación · Iniciativa · Autonomía · Manejo de situaciones.
- **Código de Ética** (13 compromisos): supervisión semanal, registros honestos, límites claros, sin práctica privada, sin relaciones personales con PA, autocuidado.
- **Confidencialidad**: solo con supervisora/coordinación; riesgo vital o abuso → aviso inmediato.

---

## 3. La App — Qué resuelve

### Principio operativo: no es un repositorio de links sueltos
Para cada pieza de trabajo responde: **qué** hacer · **quién** · **para qué caso** · **en qué fase** · **con qué instrumento** · **hasta cuándo** · **dónde está el documento** · **quién revisa** · **validado o devuelto** · **qué falta**.

### Valor por actor
- **PER**: una sola pantalla móvil, bitácora en minutos, trabaja sin señal.
- **Coordinación**: bandeja de validación, alertas de inactividad, semáforo de supervisión, armado de duplas.
- **Nivel nacional**: KPIs del convenio en tiempo real, snapshots inmutables para remesas, auditoría exportable.

### Privacidad por diseño
- Sin nombres ni RUT de PA: solo códigos `PA-{REG}-{NNN}` (ej. `PA-MET-001`).
- Alias opcional (apodo) por caso: en pantalla se ve **Don Pato** (PA-MET-001); Drive, notificaciones y reportes usan solo el código.
- Datos filtrados por rol y región.
- Universo Demo y Real totalmente separados.

---

## 4. Funciones por rol

### PER — `/per` (todo en una página)
| Tarjeta | Función |
|---|---|
| Registro de Bitácora | Caso, fecha, modalidad, duración, ámbito, asistencia, resumen, acuerdos, dificultades, próxima acción, emoción (😊😐😢😠), reflexión |
| Mis Acompañamientos | Casos activos con etapa y tipo (Nuevo / Continuidad) |
| Historial de Bitácoras | Últimas 5: Enviada / Validada / Devuelta |
| Agenda de Tareas | Pegar enlace Drive → "Enviar a Revisión"; ver observaciones si fue devuelta |
| Notificaciones | Avisos de coordinación |
| Mis Supervisiones | Registro hecho por coordinación |

- **Offline**: banner amarillo → "Guardar Borrador Local" → "Sincronizar ahora" al volver la señal. Borradores solo en ese dispositivo.
- **Deshabilitado**: aviso "PER Deshabilitado".

### Coordinador Regional — `/coordinacion`
| Sección | Ruta | Función |
|---|---|---|
| Resumen regional | `/coordinacion` | Tareas, funnel Fase 2, casos por etapa, "Evaluar Alertas" |
| Registro de Ingresos | `/candidatas` | Funnel de ingreso, proponer dupla con fundamentación |
| Acompañamientos | `/casos` | Validar y formalizar dupla, timeline, avance de etapa, retiro/deserción, enlaces a carpeta/IAP/Acta |
| Validación sesiones | `/sesiones` | Bandeja → modal completo → Aprobar o Devolver con observaciones |
| Supervisiones | `/supervisiones` | Dotación PER (Habilitado/Deshabilitado), registrar supervisión (agenda en Calendar), semáforo 💚 / ⚠️ >15 d / 🔴 >30 d |
| Redes | `/redes` | Dispositivos territoriales, activaciones (derivaciones), focus groups y reuniones de equipo (Fase 5) |
| Alertas | `/alertas` | Hitos por validar, casos sin bitácora, tareas atrasadas |

### Administrador Nacional — `/admin`
| Sección | Función |
|---|---|
| Resumen | KPIs nacionales filtrables por región; sincronizar Google Workspace |
| Usuarios | Crear cuentas PER (quedan habilitadas), asignar región, Deshabilitar/Habilitar |
| Instrumentos | Catálogo por fase: obligatorio, bloquea avance, requiere validación; Vigente/Borrador/Archivado |
| Reportes SENDA | Métricas del convenio por región, período y desagregación (género, edad, educación, empleo); CSV; **Congelar Snapshot** |
| Auditoría | Log inmutable (quién, rol, acción, entidad, valores previos/nuevos); exportar CSV |

---

## 5. Ciclo de vida de un caso (flujo para demo en vivo)

1. **Admin** crea cuenta PER (queda habilitada).
2. **Coord** registra candidata y la avanza por el funnel hasta *Admisible/Seleccionada*.
3. **Coord** propone dupla (PER + PA + fundamentación) → valida → PER entrega Acta de Primer Encuentro → **formaliza**.
4. Sistema crea en Drive carpeta del caso + IAP desde plantilla + tareas por instrumento.
5. **PER** registra bitácoras → **Coord** valida o devuelve.
6. **PER** entrega documentos (enlace Drive) → **Coord** valida → copia a `99_Validados`.
7. **Coord** avanza etapa: Vinculación → Conexión → Finalización.
8. **Egreso** solo con Ex-Post + Encuesta de Satisfacción validadas.
9. **Admin** congela snapshot en fecha de corte → evidencia para remesa.

### Estructura Drive generada
```
Región/
└── PER_{id}/
    └── PA-REG-000/
        ├── 01_Vinculacion/   (Acta Primer Encuentro, IAP_v01)
        ├── 02_Conexion/
        ├── 03_Finalizacion/
        └── 99_Validados/
```

---

## 6. Reglas de negocio clave

| Regla | Detalle |
|---|---|
| Estado PER | Habilitado o Deshabilitado, sin estados intermedios. Deshabilitado no ingresa ni recibe casos |
| Carga | Habitual 1 PER : 1 PA; sin tope en la plataforma |
| Match | Requiere fundamentación; pasa por Propuesto → Validado → Formalizado |
| Egreso | Bloqueado sin Ex-Post + Encuesta de Satisfacción validadas ("Requisito Metodológico del Convenio") |
| Retiro / Deserción | Se registran con motivo; intentos de contacto se gestionan fuera de la app. Cierran el caso y liberan al PER |
| Inactividad | Alerta por días sin bitácora según etapa (por defecto 10 / 14 / 10, configurable), al presionar "Evaluar Alertas" |
| Supervisión | Semáforo: > 15 días alerta, > 30 días crítico |
| Bitácora enviada | No se edita; si se devuelve, se reenvía corregida |
| Auditoría | Toda acción crítica queda registrada, no se borra |

---

## 7. KPIs del convenio SENDA

| N° | Indicador | Meta |
|---|---|---|
| 1.1 | Adherencia ≥ 3 meses (casos continuidad) | ≥ 80% |
| 1.2 | Proporción de casos nuevos | ≥ 60% |
| 2.1 | Evaluación ex-ante completada | ≥ 80% |
| 2.2 | Monitoreo del IAP con evaluaciones | ≥ 80% |
| 2.3 | Encuesta de satisfacción en casos cerrados | ≥ 80% |
| 3 | Distribución por etapa | — |
| 4 | Formación y mentoría PER | — |
| 5 | Cumplimiento documental (tareas validadas) | — |

En la consola: síntesis ejecutiva (casos, adherencia general, % nuevos, satisfacción al cierre), capitales de recuperación por ámbito, niveles de intensidad, sesiones por etapa, supervisiones y evaluaciones intermedias, activaciones de red por tipo, caracterización (género, edad, educación, empleo). Datos faltantes se muestran como "Sin registrar" / "Sin nivel asignado".

**Fechas de corte**: Informe 2 — 14/06/2026 · Informe 3 — 02/09/2026 · Informe 4 — 20/01/2027 · Informe 5 — 01/08/2027 · Informe 6 — 12/12/2027.

---

## 8. Modo Demo vs Modo Real

| | 🧪 Demo | 🔒 Real |
|---|---|---|
| Acceso | Botones de acceso directo en login | Usuario + contraseña |
| Datos | Ficticios precargados | Parte vacío |
| Uso | Capacitación, presentaciones | Pilotaje oficial |
| Indicador | Insignia "Modo Demo" | Sin insignia |

Nunca se mezclan: casos, tareas, notificaciones, snapshots, dispositivos y auditoría llevan marca `isDemo`.

---

## 9. Diferenciadores técnicos (para audiencia no técnica)

- **Instalable sin tienda** (PWA): Android, iPhone, PC.
- **Funciona en terreno sin señal**: borradores locales + sincronización.
- **Avisos en tiempo real**: campana in-app (cada 15 s) + notificaciones push al celular.
- **Google Workspace real**: Drive, Docs (IAP desde plantilla), Calendar/Meet (supervisiones), Sheets (sincronización). Sin URL configurada → simulación local segura.
- **Trazabilidad total**: auditoría inmutable + snapshots congelados.

---

## 10. Arquitectura (para audiencia técnica)

### Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (SQLite local / Turso-libSQL en producción / D1 opcional) · Web Push (VAPID) · Google Apps Script como puente a Workspace.

### Estructura
```
docs/              Documentación (este archivo, Manual, Guía, Estructura, despliegue)
prisma/            schema.prisma, seed.ts, migrations/
public/            manifest.json, sw.js (caché + push), icons/, Resumen.md
src/app/
  (admin)/admin    Panel nacional
  (auth)/login     Acceso
  (coord)/coordinacion  Panel regional
  (per)/per        Panel PER móvil
  actions/         Server Actions (admin, auth, coordinator, per, notifications)
  api/push/        Suscripción push
src/components/    AppShell, formularios de bitácora/tareas, cola de validación
src/lib/           auth (cookie HMAC), db (selector de adaptador), nomenclaturas
src/server/        services (cases, sessions, tasks, alerts, push), google/workspace.ts
GoogleAppsScript.gs   Web App: carpetas Drive, copia IAP, Calendar, Sheets
```

### Modelo de datos (núcleo)
`User` · `PERProfile` · `PACandidate` · `PACase` (+ historial de estado y etapa) · `SessionLog` · `Task` (+ eventos, feedback) · `Instrument` · `IAPRecord` (+ mapas por ámbito, objetivos) · `Supervision` · `Alert` · `NetworkDevice` / `NetworkActivation` · `Phase5Record` · `DocumentRecord` · `ReportSnapshot` · `AuditLog` · `Notification` · `PushSubscription`.

### Despliegue
| Destino | Notas |
|---|---|
| **Vercel + Turso** | Producción principal |
| **Cloudflare (OpenNext)** | Alternativa: `wrangler.json`, adaptador D1 |

### Variables de entorno
`AUTH_SESSION_SECRET` (≥ 32) · `REAL_MODE_PASSWORD` · `TURSO_DATABASE_URL` · `TURSO_AUTH_TOKEN` · `GOOGLE_APPS_SCRIPT_URL` (termina en `/exec`) · `GOOGLE_APPS_SCRIPT_SECRET` (= `API_SHARED_SECRET` de Apps Script) · `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `VAPID_PRIVATE_KEY` · `VAPID_SUBJECT`. Opcional: `NEXT_PUBLIC_REQUIRE_TEXT_FIELDS=true` vuelve a exigir los textos obligatorios (motivos, observaciones, enlaces, descripciones); por defecto está apagado y se aplica al construir (en Vercel, redeploy).

Apps Script: propiedades `ROOT_FOLDER_ID`, `TEMPLATE_DOC_ID` (IAP oficial), `SPREADSHEET_ID`, `CALENDAR_ID`, `API_SHARED_SECRET`; ejecutar `authorizeWorkspace` una vez; desplegar nueva versión.

### Comandos
```bash
npm run dev                 # desarrollo
npm run build && npm start  # producción
npx prisma db push          # sincronizar esquema
npx prisma db seed          # datos demo
npx prisma studio           # explorar BD
npx tsc --noEmit            # chequeo de tipos
npx next lint               # lint
```

---

## 11. Glosario rápido

**PER** par especialista · **PA** persona acompañada · **Dupla** PER+PA · **IAP** itinerario personalizado · **Bitácora** registro de sesión · **Match / Fundamentación** asignación y su justificación · **Habilitado / Deshabilitado** estado de la cuenta PER · **Egreso** cierre exitoso · **Retiro voluntario** salida por decisión de la PA · **Deserción** abandono sin respuesta a contactos · **Snapshot** foto inmutable de KPIs · **Remesa** pago de SENDA contra indicadores · **CESFAM / OMIL** salud familiar / intermediación laboral · **TUS** trastorno por uso de sustancias.

---

## 12. Mensajes de cierre

- La recuperación es posible; los PER son su testimonio vivo.
- La app no burocratiza el vínculo: libera tiempo del PER para acompañar.
- Coordinación ve a tiempo qué caso se enfría y qué PER necesita supervisión.
- SENDA recibe indicadores verificables, con trazabilidad y evidencia en Drive.
