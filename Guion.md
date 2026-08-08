# 🎬 Guión de Video Demostrativo — Plataforma de Coordinación PER 2026-2027

**Versión**: 1.0 — Agosto 2026
**Destino**: Presentación de funcionalidades para el pilotaje PER (SENDA / AVANZA Inclusión)
**Duración objetivo**: 26–30 min (versión completa) · 8–9 min (corte ejecutivo, ver §Corte corto)
**Documentos base**: [Manual.md](Manual.md), [Guia.md](Guia.md), [Estructura.md](Estructura.md) + código fuente
**Pruebas que respaldan cada escena**: [PruebasUnitarias.md](PruebasUnitarias.md)

> Cada escena lleva un identificador `E##`. Ese mismo identificador aparece en `PruebasUnitarias.md`, de modo que **toda afirmación del video tiene una prueba automatizada que la respalda**. Si una prueba falla, se sabe exactamente qué escena del video quedó desactualizada.

---

## 0. Preparación antes de grabar

### 0.1 Reset del entorno demo

```bash
npx prisma db push && npx prisma db seed
```

```bash
npm run dev
```

> ⚠️ `prisma db seed` **borra y repuebla toda la base**. Solo se ejecuta contra `dev.db` local: el propio seed aborta si detecta variables de Turso/producción (`assertNotProduction()` en [prisma/seed.ts](prisma/seed.ts:41)).

### 0.2 Estado exacto del entorno demo después del seed

Estos son los datos que **realmente** genera el seed. El guión los usa literalmente; no improvisar códigos.

| Región | Casos generados | PER de la región |
|---|---|---|
| Metropolitana | `PA-MET-001` … `PA-MET-004` | `per.carla` (Habilitado), `per.diego`, `per.juan` |
| Valparaíso | `PA-VAL-005` … `PA-VAL-008` | `per.valpo` / Andrés Silva (Habilitado), `per.sonia` |
| Tarapacá | `PA-TAR-009` … `PA-TAR-012` | `per.lucas` (Habilitado), `per.mario` |
| Biobío | `PA-BIO-013` … `PA-BIO-016` | `per.camila` (Habilitado) — **tiene los 4 casos** |
| Los Ríos | `PA-LOS-017` … `PA-LOS-020` | `per.pedro` (Habilitado), `per.elena` |

Casos protagonistas del video:

| Caso | PER | Etapa | Estado del itinerario tras el seed |
|---|---|---|---|
| `PA-MET-001` | Carla Muñoz | Vinculación | Paso 1 (*Primer encuentro*) en **ENVIADA**, esperando validación |
| `PA-MET-004` | Carla Muñoz | Finalización | Actividad 5 Final y Actividad 6 **validadas**; *Encuesta de Satisfacción* **ENVIADA** (enlace externo) |
| `PA-MET-002` | Diego Rojas | Egreso | Etapa Finalización íntegramente validada; su última sesión está **ENVIADA** (aparece en la bandeja de sesiones) |
| `PA-LOS-019` | Pedro Castillo | Conexión | *Actividad 5 Intermedia* **ENVIADA**; Registro de Acompañamiento disponible de forma continua |
| `PA-BIO-013/015/016` | Camila Vera | Vinculación / Conexión / Finalización | Un solo PER con casos en las 3 etapas |

### 0.3 Setup de grabación

| Aspecto | Configuración |
|---|---|
| Resolución | 1920×1080, navegador a 1440×900 (zoom 110% para legibilidad) |
| Vista PER | Emulación móvil 390×844 (iPhone 12/13) — la vista PER es PWA móvil |
| Sesiones simultáneas | Ventana A = perfil normal (rol administrativo) · Ventana B = ventana de incógnito (rol PER). Evita cerrar sesión en cada corte |
| Contraseña modo real | `P455w0rd!` (valor por defecto de `REAL_MODE_PASSWORD`) — **no mostrarla en pantalla**: escribirla con el campo enmascarado y no leerla en voz alta |
| Datos sensibles | Nunca mostrar nombres reales de personas acompañadas. El sistema ya solo expone códigos (`PA-MET-001`) y alias opcionales |
| Cursor | Resaltado de clics activado |

---

## Mapa de bloques

| Bloque | Contenido | Escenas | Duración |
|---|---|---|---|
| **A** | Contexto y acceso | E01–E04 | 3:30 |
| **B** | Administrador Nacional | E05–E11 | 6:00 |
| **C** | Coordinación regional — ingreso y duplas | E12–E14 | 3:30 |
| **D** | PER en terreno — itinerario secuencial | E15–E20 | 6:30 |
| **E** | Ciclo de validación coordinación ↔ PER | E21–E24 | 4:00 |
| **F** | Cierre de caso: gates, egreso y abandono | E25–E28 | 3:30 |
| **G** | Supervisión, redes y alertas | E29–E32 | 3:00 |
| **H** | Offline, PWA y cierre | E33–E35 | 2:00 |

---

# BLOQUE A — Contexto y acceso

## E01 · Apertura (00:00 – 00:45)

**Pantalla**: portada estática con el escudo azul del login de fondo desenfocado.

**Locución**:
> «Esta es la Plataforma de Coordinación PER 2026-2027, desarrollada para el Pilotaje de Recuperación Basada en Pares de SENDA y AVANZA Inclusión. En los próximos minutos vamos a recorrer sus tres roles —Acompañante PER, Coordinación Regional y Administración Nacional— siguiendo el mismo camino que hace un acompañamiento real: desde el ingreso de una persona al programa hasta su egreso.
> Una aclaración importante desde el inicio: esta aplicación **no reemplaza** los documentos oficiales del programa. Los formularios, actas e informes siguen viviendo en Google Workspace. Lo que hace la plataforma es ordenarlos, convertirlos en tareas con responsable y plazo, y dejar trazabilidad de cada acción.»

---

## E02 · Pantalla de login y directorio de usuarios (00:45 – 01:45)

**Ruta**: `/login`

**Acciones en pantalla**:
1. Mostrar la pantalla completa: título *PER 2026-2027*, campos Usuario y Contraseña.
2. Clic en **👥 Ver Usuarios** → se abre el modal *Usuarios Registrados en el Sistema*.
3. Recorrer el modal: sección Administración Nacional (1 cuenta) y Coordinadores Regionales (5 cuentas).
4. Señalar la nota del pie: *«Los Acompañantes PER son creados dinámicamente desde la plataforma por el Administrador Nacional»*.
5. Clic en **Usar** sobre *Coordinadora Metropolitana* → el campo Usuario se autocompleta con `coord.metro`. Cerrar sin ingresar.

**Locución**:
> «El acceso es por nombre de usuario, sin necesidad de escribir el dominio del correo. El botón "Ver Usuarios" abre el directorio de las seis cuentas institucionales del pilotaje: la Administración Nacional y los cinco Coordinadores Regionales. Nótese que **no muestra ningún correo electrónico**, solo el usuario que hay que escribir. Los Acompañantes PER no aparecen aquí, porque no vienen precargados: los crea la Administración Nacional, caso por caso.»

**🧪 Respaldo**: `AUTH-01`, `AUTH-02`, `UI-01`

---

## E03 · Modo Demo vs. Modo Real (01:45 – 02:45)

**Acciones en pantalla**:
1. Escribir `per.carla` en el formulario **real**, contraseña, **Ingresar al Portal**.
2. Aparece el error rojo: *«Esta es una cuenta de demostración. Ingresa con el Acceso Directo Demo, no con este formulario»*.
3. Escribir `coord.metro` con contraseña incorrecta → *«Contraseña incorrecta»*.
4. Bajar y hacer clic en **🧪 Cuentas de Evaluación Operativa** → se abre el modal con las 16 cuentas de acceso directo (1 Admin, 5 Coordinadores, 10 PER, con insignias *ADMIN DEMO / COORD DEMO / PER DEMO* y estado *Habilitado / Pendiente*).

**Locución**:
> «La plataforma opera en dos universos completamente separados. El **modo real** es el entorno oficial del pilotaje: arranca vacío y se llena conforme los equipos trabajan. El **modo demo** trae datos ficticios precargados para capacitación y evaluación.
> Lo que decide el modo de una sesión no es la cuenta, sino **cómo se entró**. Si entro por el formulario, la sesión es real. Si entro por este modal, la sesión es demo. Y las cuentas marcadas como solo-demostración —como estos diez PER de prueba— quedan bloqueadas en el formulario real, para que nunca se genere una sesión "real" sobre datos que solo existen en la demo.
> Todo lo que veremos a continuación ocurre en modo demo, sobre datos ficticios.»

**🧪 Respaldo**: `AUTH-03`, `AUTH-04`, `AUTH-05`, `AUTH-06`

> ✅ **Nota para el editor**: resuelto en la auditoría de agosto 2026 (F12) — el Manual (§14) ya dice **16 cuentas**, alineado con el modal. Narrar «dieciséis cuentas».

---

## E04 · Navegación general (02:45 – 03:30)

**Acciones**: entrar como **Administrador Nacional (demo)**. Mostrar la barra superior: nombre + rol + región, insignia **🧪 Modo Demo**, campana 🔔 con contador de avisos, botón Cerrar Sesión. Abrir el menú hamburguesa ☰ y recorrer las 5 secciones del Admin. Reducir la ventana a ancho móvil para mostrar el cajón lateral deslizante.

**Locución**:
> «La barra superior es constante: identidad y rol a la izquierda; a la derecha, la campana de avisos —que se actualiza sola cada quince segundos y tiembla cuando llega algo nuevo— y el cierre de sesión. La insignia "Modo Demo" solo aparece en sesiones de demostración: en modo real no hay ninguna insignia. El menú lateral cambia según el rol y se convierte en un cajón deslizante en pantallas chicas.»

**🧪 Respaldo**: `UI-02`, `UI-03`

---

# BLOQUE B — Administrador Nacional

## E05 · Consola de resumen (03:30 – 04:15)

**Ruta**: `/admin`

**Acciones**: recorrer las tarjetas: casos totales / activos / cerrados, distribución por fase y etapa, indicadores de adherencia y satisfacción, resumen por región con % de cobertura sobre la cuota.

**Locución**:
> «El Administrador Nacional no ve datos personales: ve agregados. Aquí están los veinte casos del pilotaje distribuidos en las cinco regiones, cada una con su cuota comprometida en el convenio: veinte casos en la Metropolitana, ocho en Valparaíso, seis en Tarapacá, cuatro en Biobío y once en Los Ríos.»

**🧪 Respaldo**: `RPT-01`

---

## E06 · Gestión de Usuarios — crear un PER (04:15 – 05:15)

**Ruta**: `/admin/usuarios`

**Acciones**:
1. Mostrar las dos nóminas separadas: Acompañantes PER (editable) y los 5 Coordinadores Regionales (fijos).
2. **➕ Crear Acompañante PER** → nombre `Rosa Aguilera`, usuario `per.rosa`, región `Valparaíso` → **Crear Usuario**.
3. Señalar el correo institucional autogenerado `per.rosa@per2026.cl` y que la fila aparece de inmediato en la nómina.

**Locución**:
> «Aquí nacen las cuentas de los acompañantes. Se ingresa nombre, usuario y coordinación regional; el correo institucional se genera solo. Desde este momento la persona puede iniciar sesión y su coordinación regional puede asignarle casos.»

**🧪 Respaldo**: `ADMN-01`, `ADMN-02`

---

## E07 · Editar y eliminar con confirmación de contraseña (05:15 – 06:30)

**Acciones**:
1. **Editar** sobre `per.rosa` → cambiar región a `Biobío` → escribir una contraseña **incorrecta** → guardar → aviso de error, **nada cambia**.
2. Repetir con la contraseña correcta → cambio aplicado.
3. **Eliminar** sobre `per.carla` (que tiene casos) → el sistema **bloquea** la eliminación y sugiere desactivar.
4. **Eliminar** sobre `per.rosa` (sin casos) → confirmar con contraseña → eliminada.
5. Mostrar el botón **Desactivar** en otra fila y mencionar que la cuenta `admin@per2026.cl` no se puede desactivar.

**Locución**:
> «Editar y eliminar son acciones sensibles, así que ambas exigen volver a escribir la contraseña de administrador. Si la contraseña no coincide, no se guarda absolutamente nada.
> Y hay una segunda barrera, esta del lado del servidor: **no se puede eliminar un PER que tenga casos asociados**. La plataforma lo impide para no dejar acompañamientos huérfanos, y sugiere desactivar la cuenta en su lugar —lo que impide iniciar sesión, pero conserva la trazabilidad. Las tres acciones quedan registradas en la auditoría.»

**🧪 Respaldo**: `ADMN-03`, `ADMN-04`, `ADMN-05`, `ADMN-06`, `ADMN-07`

---

## E08 · Catálogo de instrumentos (06:30 – 07:15)

**Ruta**: `/admin/instrumentos`

**Acciones**: recorrer las tarjetas agrupadas por Fase 1 a 5; señalar los contadores de tipo (`GOOGLE_DOC` / `GOOGLE_FORM`), los estados *Vigente / Borrador / Archivado* y las banderas *obligatorio*, *bloquea avance*, *requiere validación*.

**Locución**:
> «Este es el catálogo oficial de instrumentos: los dieciséis documentos, formularios y encuestas que estructuran el pilotaje, ordenados por fase. Cada uno declara si es obligatorio, si bloquea el avance de etapa del caso y si requiere validación de coordinación.»

**🧪 Respaldo**: `INST-01`

---

## E09 · Editor de ubicación en el itinerario (07:15 – 08:15)

**Acciones**:
1. Ubicar *Actividad 3: Mapa de recursos y necesidades* → usar `InstrumentPlacementEditor` para cambiar su **orden** dentro de Vinculación de `4` a `3`.
2. Guardar.
3. **Sin cerrar sesión**, abrir la ventana B (PER Carla, `PA-MET-001`) y mostrar que la lista de *Próximos en esta etapa* cambió de orden.
4. Revertir el cambio.

**Locución**:
> «Esta es una pieza clave: la secuencia del itinerario **no está escrita en el código**, se configura acá. Puedo cambiar a qué etapa pertenece un instrumento y en qué orden aparece dentro de ella, y ese orden es exactamente el que determina qué actividad ve el acompañante como paso actual. Si la metodología cambia a mitad del pilotaje, se ajusta desde esta pantalla, sin tocar el sistema.»

**🧪 Respaldo**: `INST-02`, `INST-03`, `ITIN-05`

---

## E10 · Reportes SENDA y congelamiento de snapshot (08:15 – 09:15)

**Ruta**: `/admin/reportes`

**Acciones**:
1. Mostrar las 8 métricas del convenio con sus metas.
2. Cambiar el filtro de **Región** a `Metropolitana` y observar el recálculo.
3. Cambiar el **período** a *Informe 3 (Corte 02/09/2026)* → señalar que los KPIs se recalculan "as-of" esa fecha de corte.
4. Clic en **Congelar Reporte Oficial** → confirmar.
5. Mostrar que el reporte queda congelado y que la campana 🔔 recibe el aviso *«Reporte Oficial Congelado»*.

**Locución**:
> «Estas son las ocho métricas críticas del convenio: adherencia de al menos tres meses, proporción de casos nuevos sobre el sesenta por ciento, evaluaciones ex-ante y ex-post al ochenta por ciento, encuesta de satisfacción en casos cerrados, y los indicadores de fase, formación y cumplimiento documental.
> Se pueden desagregar por región y calcular a cualquiera de las fechas de corte oficiales de los informes 2 al 6. Y cuando llega el momento de rendir, el botón "Congelar Reporte Oficial" guarda una **foto inmutable** de los indicadores a esa fecha: eso es lo que se presenta como evidencia para la liberación de remesas. Al congelarlo, la plataforma notifica automáticamente a la coordinación involucrada.»

**🧪 Respaldo**: `RPT-02`, `RPT-03`, `RPT-04`, `RPT-05`

---

## E11 · Auditoría inmutable (09:15 – 09:45)

**Ruta**: `/admin/auditoria`

**Acciones**: mostrar el registro cronológico; localizar las entradas recién generadas (`CREACION_USUARIO_PER`, `EDICION_USUARIO_PER`, `ELIMINACION_USUARIO_PER`). Clic en **📥 Exportar a CSV** y mostrar el archivo descargado.

**Locución**:
> «Todo lo que acabamos de hacer ya está aquí. La bitácora de auditoría registra usuario, rol, fecha, acción, entidad afectada y los valores previos y nuevos. No se puede editar ni borrar desde ninguna pantalla de la aplicación, y se exporta a CSV para los auditores de SENDA.»

**🧪 Respaldo**: `AUD-01`, `AUD-02`

---

# BLOQUE C — Coordinación regional: ingreso y duplas

## E12 · Panel regional (09:45 – 10:15)

**Cuenta**: `coord.metro` (demo) · **Ruta**: `/coordinacion`

**Acciones**: mostrar estadísticas de tareas (pendientes, en revisión, completadas, atrasadas), el funnel de Fase 2 y la distribución de casos por etapa.

**Locución**:
> «La coordinación regional ve **solo su región**. Este filtro no es cosmético: está impuesto en el servidor, en cada operación. Un coordinador no puede leer ni operar casos de otra región.»

**🧪 Respaldo**: `CASE-01`, `CASE-02`

---

## E13 · Nómina y funnel de Fase 2 (10:15 – 11:00)

**Ruta**: `/coordinacion/candidatas`

**Acciones**: recorrer los 9 estados del funnel (*Derivada → Contactada → Preinscrita → Entrevistada → Admisible → No Admisible → Seleccionada → En espera → Descartada*) en el resumen regional, y en `/coordinacion/candidatas` la nómina completa (no solo los aptos para match) con un selector de estado editable por fila y su centro derivador (COSAM) — sin nombres. Cambiar el estado de una persona en vivo y mostrar cómo el embudo del resumen regional refleja el conteo al instante.

**Locución**:
> «La Fase 2 es el embudo de ingreso. Cada persona derivada recorre estos estados antes de ser asignada a un acompañante, y el coordinador los actualiza con un clic desde la misma tabla — no es un valor que se fija una sola vez al ingresar. Fíjense en que la tabla no muestra nombres ni RUN: la caracterización se guarda para los indicadores —sexo, rango etario, nivel educacional, situación laboral— pero la identidad de la persona nunca entra a la plataforma.»

**🧪 Respaldo**: `CAND-01`

---

## E14 · Conformar una dupla (11:00 – 12:30)

**Acciones**:
1. En *Registrar Dupla & Proponer Match*: seleccionar una persona **Admisible**.
2. Abrir el selector de PER → señalar que **solo aparecen PER disponibles de la región** (habilitados y sin un acompañamiento activo — un PER lleva como máximo uno a la vez).
3. Tipo: `Nuevo`. Fundamentación: *«Afinidad territorial y experiencia previa del acompañante en vinculación comunitaria»*. Pegar el enlace del Acta de Primer Encuentro en el mismo formulario.
4. **Conformar Dupla** → un solo envío: la aplicación aprovisiona las carpetas de Drive del caso (Vinculación / Conexión / Finalización / Validados), crea el documento IAP y redirige a la ficha del caso ya `FORMALIZADO`, con el nuevo código correlativo resaltado.
5. En la ficha, mostrar la tarjeta **Reasignar Acompañante**: es la única operación de excepción disponible después de formalizar — cambia el PER a cargo, libera el cupo del anterior y notifica a ambos.

**Locución**:
> «Conformar una dupla es un acto técnico que queda fundamentado. Se elige a la persona, se elige al acompañante —y aquí la plataforma solo ofrece PER disponibles de la región: habilitados y sin otro acompañamiento activo, porque un PER lleva un caso a la vez— y se escribe **por qué** se eligió a esa dupla.
> Todo eso, más el Acta de Primer Encuentro, va en el mismo formulario: no hay una propuesta que alguien tenga que volver a abrir y validar por separado. Al enviarlo, la plataforma crea en Google Drive toda la estructura de carpetas del caso y su documento IAP, y avisa al acompañante. Si algo falla a mitad de camino, no se escribe nada: no quedan casos a medio formalizar ni carpetas huérfanas. Y si más adelante hay que cambiar de acompañante, está la opción de reasignar, con motivo y notificación a ambos.»

**🧪 Respaldo**: `CASE-03`, `CASE-04`, `CASE-05`, `CASE-06`, `CASE-07`

---

# BLOQUE D — El PER en terreno: itinerario secuencial

> A partir de aquí, grabar en **vista móvil 390×844**, ventana B.

## E15 · Entrada del acompañante (12:30 – 13:15)

**Cuenta**: `per.camila` (demo, Biobío) · **Ruta**: `/per`

**Acciones**: mostrar las 2 pestañas fijas inferiores (**📅 Mi Agenda · 🔔 Avisos**). Un PER lleva como máximo un acompañamiento activo a la vez, así que `/per` no es una lista: redirige directo al itinerario del único caso activo de Camila. Señalar el código, el tipo (*Nuevo* / *Continuidad*) y el semáforo de etapa en el encabezado del tablero.

**Locución**:
> «Esta es la vista del acompañante, pensada para el celular y para el trabajo en terreno: dos pestañas, nada más. No hay una lista de casos que recorrer, porque cada acompañante lleva un solo caso activo a la vez — entrar a la app te deja directo en tu instrumento. El caso se identifica por su código —`PA` de Persona Acompañada, la región y el correlativo— y por el color de su etapa: amarillo en Vinculación, azul en Conexión, verde en Finalización.»

**🧪 Respaldo**: `PER-01`, `NOM-01`

---

## E16 · El tablero de itinerario (13:15 – 14:15)

**Cuenta**: `per.carla` · **Ruta**: `/per/casos/<PA-MET-001>/etapa`

**Acciones**: mostrar los tres bloques del tablero: **✔ Completados de esta etapa** (colapsable), el **paso actual** y **Próximos en esta etapa** (en gris, solo títulos). Aquí el paso actual muestra la tarjeta azul *«📤 Primer encuentro… Enviado a coordinación, esperando validación»*.

**Locución**:
> «Este es el corazón de la aplicación. El acompañante **no ve los diez formularios del IAP a la vez**: ve lo que ya entregó, ve el paso que le toca ahora, y ve el nombre de lo que viene después, bloqueado.
> En este caso el paso actual ya fue enviado, así que en lugar del formulario aparece este aviso: está esperando que coordinación lo revise. El siguiente paso no existe todavía —ni siquiera como registro en la base de datos— hasta que este quede validado.»

**🧪 Respaldo**: `ITIN-01`, `ITIN-02`, `UI-04`

---

## E17 · Devolución con observaciones (14:15 – 15:15)

**Acciones** (alternando ventanas):
1. **Ventana A** — `coord.metro` → `/coordinacion/casos` → buscar `PA-MET-001` → panel *Itinerario de Instrumentos — Etapa Vinculación*.
2. Escribir la observación: *«Falta detallar el encuadre acordado en el primer encuentro»* → **❌ Devolver**.
3. **Ventana B** — recargar la vista de Carla: el paso vuelve a aparecer como formulario editable.
4. Completar *Fecha del encuentro* y *Reflexión personal del PER* → **Enviar a Coordinación**.
5. **Ventana A** — refrescar → **✅ Validar**.
6. **Ventana B** — recargar: *Primer encuentro* pasó al bloque **Completados** y el paso actual ahora es **Actividad 1: Motivaciones y expectativas**.

**Locución**:
> «Así funciona el ciclo completo. La coordinación revisa el contenido enviado y tiene dos caminos: validar, o devolver con una observación —que es obligatoria: no se puede devolver un instrumento sin decir por qué.
> Cuando se devuelve, el formulario reaparece del lado del acompañante **con lo que ya había escrito precargado**, para que corrija sobre su propio texto y no rehaga el trabajo. Y cuando se valida, el paso se cierra y el siguiente se desbloquea automáticamente. Ese es el mecanismo que garantiza que el IAP se construya en el orden metodológico correcto.»

**🧪 Respaldo**: `ITIN-03`, `ITIN-04`, `ITIN-06`, `TASK-01`, `TASK-02`

> **Nota de grabación**: el paso sembrado se envió sin contenido, así que al devolverlo el formulario aparece vacío. Para mostrar la **precarga** en pantalla, hacer el ciclo de devolución sobre *Actividad 1* después de que Carla la haya llenado (paso 4 de arriba).

---

## E18 · Actividad 2 y el alias de la persona acompañada (15:15 – 16:15)

**Acciones**:
1. Validar *Actividad 1* desde la ventana A para desbloquear *Actividad 2*.
2. En la ventana B, mostrar el formulario de **Actividad 2**: 13 preguntas agrupadas en 5 secciones con encabezado propio (*1. Presentación y contexto*, *2. Intereses y actividades*, *3. Experiencias generales*, *4. Preferencias y comodidad*, *5. Cierre*).
3. Primera pregunta: *«¿Cómo te gustaría que te llamara?»* → escribir `Fer`.
4. Completar los campos obligatorios y **Enviar a Coordinación**.
5. Señalar el encabezado del tablero: el caso ahora se lee **`PA-MET-001 (Fer)`**, sin salir de la pantalla.

**Locución**:
> «La Actividad 2 explora antecedentes y contexto. Son trece preguntas organizadas en cinco secciones, tal como en el instrumento oficial.
> Y la primera es especial: "¿cómo te gustaría que te llamara?". Es un campo **opcional**, y es un apodo o forma de trato —nunca el nombre legal ni el RUN. Si la persona elige uno, aparece junto al código del caso en toda la aplicación, para que el acompañante y su coordinación puedan referirse a ella de forma cercana sin que su identidad legal entre nunca al sistema.»

**🧪 Respaldo**: `ITIN-07`, `ITIN-08`, `NOM-02`, `UI-05`

---

## E19 · Actividades 3 y 4: el IAP propiamente tal (16:15 – 17:15)

**Acciones**:
1. Validar Actividad 2 → aparece **Actividad 3: Mapa de recursos y necesidades**: una fila por cada uno de los **9 ámbitos de recuperación**, con *necesidades*, *fortalezas* e *importancia*.
2. Completar 2–3 ámbitos y enviar. Validar desde la ventana A.
3. Aparece **Actividad 4: Planificación de objetivos y acciones**: filas dinámicas con ámbito, objetivo, recursos, actividades y plazo. Agregar un objetivo: *«Vincularse a un taller comunitario del CESFAM»* (ámbito *Apoyo social*).
4. Enviar y validar.
5. Mostrar el mensaje final del tablero: *«🎉 Todos los instrumentos de esta etapa están completos. La coordinación revisará el avance de etapa.»*

**Locución**:
> «Las actividades 3 y 4 son el IAP propiamente tal. La Actividad 3 mapea los nueve ámbitos de recuperación —apoyo social, ciudadanía, tiempo libre, empleo, situación judicial, educación, habitabilidad, situación financiera y salud— registrando para cada uno las necesidades, las fortalezas y qué tan importante es para la persona.
> La Actividad 4 convierte ese mapa en objetivos concretos, con sus recursos, sus actividades y su plazo. Esto no queda como texto suelto: se guarda como objetivos versionados, y en un momento van a ver por qué eso importa.»

**🧪 Respaldo**: `ITIN-09`, `ITIN-10`, `ITIN-11`

---

## E20 · Registro de Acompañamiento (etapa Conexión) (17:15 – 18:45)

**Cuenta**: `per.pedro` (demo, Los Ríos) · **Caso**: `PA-LOS-019`

**Acciones**:
1. Mostrar el tablero de la etapa **Conexión**: además de los pasos secuenciales, aparece el **Registro de Acompañamiento** de forma permanente, con el título *«Registro de Acompañamiento · Sesión #N»* y el contador de registros validados.
2. Llenar: fecha (hoy), modalidad *Presencial*, ámbito *Apoyo social*.
3. **Abrir el selector de Objetivo** → mostrar que trae los objetivos definidos en la Actividad 4, no texto libre.
4. Registro emocional 😊 Bien, descripción y reflexión personal.
5. **Enviar a Coordinación**.

**Locución**:
> «En la etapa de Conexión aparece un instrumento distinto a todos los demás: el Registro de Acompañamiento. **No es un paso único**: se llena una vez por cada encuentro, durante los seis meses que dura la etapa. El número de sesión se asigna solo.
> Y acá está la conexión con el IAP: el campo "Objetivo" **no se escribe a mano**, se elige de una lista, y esa lista son exactamente los objetivos que el acompañante y la persona definieron juntos en la Actividad 4. Cada encuentro queda así amarrado a un objetivo concreto del plan. Eso es lo que después permite medir si el IAP se está cumpliendo o no.»

**🧪 Respaldo**: `SESS-01`, `SESS-02`, `SESS-03`, `ITIN-12`

---

# BLOQUE E — Ciclo de validación

## E21 · Bandeja de Validación (18:45 – 19:45)

**Cuenta**: `coord.losrios` (o `coord.metro` para `PA-MET-002`) · **Ruta**: `/coordinacion/alertas` (ítem de menú **"Validación"**)

**Acciones**:
1. Mostrar la bandeja de Registros de Acompañamiento: código del caso, número de sesión, emoji del registro emocional y primeras líneas del resumen.
2. Clic en una tarjeta → se abre el **modal de detalle completo**: fecha, modalidad, duración, ámbito, objetivo asociado, emoción, descripción, acuerdos, dificultades, próximas acciones y reflexión del PER.
3. Escribir una observación → **❌ Devolver**.
4. Abrir otra tarjeta → **✅ Aprobar y Validar**.
5. Bajar a la sección **Hitos y Entregables en Espera de Validación**, en la misma página: son los instrumentos del itinerario (IAP, evaluaciones, etc.) pendientes de aprobación.

**Locución**:
> «Registros de Acompañamiento e hitos del itinerario viven en la misma bandeja: para la coordinación es un solo gesto, "lo que el PER me mandó y espera revisión", aunque técnicamente sean dos modelos distintos. La coordinación ve una vista previa, abre el detalle completo y decide: aprobar, o devolver con comentarios. Al validar un registro, la fecha del último encuentro del caso se actualiza —y eso alimenta directamente las alertas de inactividad y el indicador de adherencia.»

**🧪 Respaldo**: `SESS-04`, `SESS-05`, `SESS-06`, `UI-06`

---

## E22 · Avisos del lado del PER (19:45 – 20:15)

**Ventana B**, pestaña **🔔 Avisos**.

**Acciones**: mostrar el bloque *Notificaciones y Avisos de Coordinación* con la devolución recién enviada, y el bloque *Mis Supervisiones Registradas*. Tocar un aviso y mostrar que redirige a la vista exacta con un destello de resaltado.

**Locución**:
> «Del otro lado, el acompañante recibe la retroalimentación en su pestaña de Avisos y en la campana. Al tocar el aviso, la aplicación lo lleva directo al registro correspondiente y lo resalta por unos segundos, para que no tenga que buscarlo.»

**🧪 Respaldo**: `NOTIF-01`, `NOTIF-02`

---

## E23 · La puerta de avance de etapa (20:15 – 21:15)

**Ventana A** — `coord.metro`, caso `PA-MET-001` (etapa Vinculación ya completa tras E17–E19).

**Acciones**:
1. Mostrar el botón **Avanzar a Conexión** habilitado, con el contador de instrumentos validados de la etapa.
2. Buscar ahora un caso con instrumentos pendientes (`PA-BIO-013`): el botón aparece **bloqueado**, con la **lista explícita de lo que falta** y, debajo, **Forzar avance de etapa**.

**Locución**:
> «Acá está la regla metodológica más importante del sistema. Un caso no avanza de etapa hasta que **todos los instrumentos obligatorios de su etapa actual estén validados**. Cuando falta algo, la plataforma no dice "no se puede" y ya: dice exactamente qué falta.
> Existe una válvula de escape, porque la realidad del terreno lo exige: "Forzar avance de etapa". Pero es un bloqueo blando con costo: exige escribir un motivo, y esa acción queda registrada en la auditoría con el detalle de qué instrumentos se saltaron. Se puede forzar; no se puede forzar en silencio.»

**🧪 Respaldo**: `ITIN-13`, `ITIN-14`, `CASE-08`, `CASE-09`, `CASE-10`

---

## E24 · Forzar avance, auditado (21:15 – 21:45)

**Acciones**: activar **Forzar avance de etapa** sobre `PA-BIO-013`, escribir el motivo *«Persona acompañada hospitalizada; se acuerda con supervisión clínica continuar en Conexión»* → confirmar. Ir a `/admin/auditoria` (ventana A, sesión Admin) y mostrar la entrada **`FORCE_STAGE_ADVANCE`** con el motivo y la lista de instrumentos omitidos.

**Locución**:
> «Ahí está la traza: acción, usuario, motivo, y los instrumentos que quedaron pendientes. Esa es la diferencia entre un sistema que confía y un sistema que rinde cuentas.»

**🧪 Respaldo**: `CASE-11`, `AUD-03`

---

# BLOQUE F — Cierre del caso

## E25 · Etapa Finalización e instrumento de enlace externo (21:45 – 22:30)

**Cuenta**: `per.carla` · **Caso**: `PA-MET-004`

**Acciones**: mostrar la etapa Finalización con *Actividad 5 (Final)* y *Actividad 6* en **Completados**, y el paso actual **Encuesta de satisfacción del proceso**, que en lugar de formulario nativo muestra un campo para **pegar el enlace** del formulario de Google. Pegar una URL y enviar.

**Locución**:
> «No todos los instrumentos son formularios nativos. Algunos —como la Encuesta de Satisfacción— viven en Google Forms, porque así lo define el convenio. Para esos, la plataforma pide el enlace del documento y lo incorpora al mismo flujo de validación. La aplicación no duplica el documento oficial: lo referencia y lo somete al mismo control.»

**🧪 Respaldo**: `ITIN-15`, `TASK-03`, `UI-07`

---

## E26 · El bloqueo de egreso (22:30 – 23:15)

**Ventana A** — `coord.metro`, caso `PA-MET-004`, antes de validar la encuesta.

**Acciones**: intentar **Avanzar a Egreso** → aparece el banner *«Requisito Metodológico del Convenio»* con los pendientes. Validar la Encuesta de Satisfacción → el botón de egreso se habilita → egresar el caso.

**Locución**:
> «El egreso tiene su propia puerta, y es la exigencia más dura del convenio: no se puede cerrar un acompañamiento sin la Evaluación Final, la Actividad 6 y la Encuesta de Satisfacción validadas. Es exactamente el indicador que SENDA audita para la última remesa, y la plataforma lo hace estructuralmente imposible de omitir por descuido.»

**🧪 Respaldo**: `ITIN-16`, `CASE-12`

---

## E27 · Retiro voluntario y Formulario de Abandono (23:15 – 24:15)

**Acciones**:
1. En la ficha de un caso activo, abrir el bloque de retiro (`WithdrawalGate`).
2. Intentar registrar el retiro directamente → la plataforma **exige el Formulario de Abandono validado**.
3. Habilitar el Formulario de Abandono — Persona Acompañada → ventana B: el acompañante lo ve aparecer en su tablero (aunque el caso esté en otra etapa) → completar motivo y enviar.
4. Ventana A: **✅ Validar** el formulario → ahora sí, registrar el **Retiro Voluntario**.

**Locución**:
> «Cuando una persona deja el programa, no basta con marcar una casilla. Se habilita un Formulario de Abandono que el acompañante debe completar y la coordinación debe validar, igual que cualquier otro instrumento. Es un instrumento condicional: no pertenece a ninguna etapa, se activa por evento.
> Recién con ese formulario validado la plataforma permite cerrar el caso, liberar el cupo del acompañante y notificar la lista de preselección regional disponible para reemplazarlo.»

**🧪 Respaldo**: `ITIN-17`, `ITIN-18`, `CASE-13`, `CASE-14`

---

## E28 · Deserción y los 3 intentos de contacto (24:15 – 24:45)

**Acciones**: intentar marcar **Deserción** en un caso sin intentos de contacto registrados → error: *«No se puede marcar deserción sin registrar al menos 3 intentos de contacto fallidos.»*

**Locución**:
> «Y la deserción exige algo más: al menos tres intentos de contacto registrados. Una persona no queda marcada como desertora porque no contestó una vez. Es una protección para la persona acompañada, escrita en el sistema.»

**🧪 Respaldo**: `CASE-15`

---

# BLOQUE G — Supervisión, redes y alertas

## E29 · Dotación PER y habilitación (24:45 – 25:30)

**Ruta**: `/coordinacion/supervisiones` (lectura) → `/admin/usuarios` (acción)

**Acciones**: en `/coordinacion/supervisiones` mostrar el listado de PER con su estado real de habilitación (*Habilitado / Pendiente / No Habilitado*, de solo lectura, con nota apuntando a Administración), si tiene o no un acompañamiento asignado (*Disponible* / *Asignado* — un PER lleva como máximo uno a la vez), horas acumuladas, última supervisión y el semáforo de cumplimiento (💚 al día / ⚠️ >15 días / 🔴 >30 días). Cambiar de ventana a `per.admin` → `/admin/usuarios` → cambiar el selector de habilitación de un PER pendiente (ej. Elena Gómez) a *Habilitado* y mostrar que aparece de inmediato en el selector de PER disponibles de *Conformar Dupla*.

**Locución**:
> «La habilitación no es un trámite administrativo: es la llave que abre la asignación de casos. Un acompañante en estado pendiente no aparece en el selector de duplas y no puede recibir tareas críticas. Esa decisión se toma en Administración —la contratación y el criterio de habilitación se resuelven en reunión de coordinación, fuera de la app— así que un PER nuevo nace habilitado por defecto, y este selector queda como excepción para suspender a alguien. El coordinador ve el estado desde su panel, pero ya no lo cambia ahí.»

**🧪 Respaldo**: `SUP-01`, `SUP-02`, `TASK-04`

---

## E30 · Registrar una supervisión (25:30 – 26:00)

**Acciones**: completar el formulario (PER, fecha, modalidad Meet, duración 60 min, casos revisados, acuerdos) → **Registrar Supervisión**. Señalar que se genera el evento de Calendar con enlace de Meet y que el PER recibe la notificación. Ir a la ventana B → pestaña Avisos → aparece la supervisión.

**Locución**:
> «Cada supervisión registrada agenda automáticamente la reunión en Google Calendar con su enlace de Meet y notifica al acompañante. El convenio exige al menos una hora semanal de supervisión por PER: este registro es la evidencia de ese cumplimiento. Y si la agenda falla, la plataforma revierte el evento para no dejar reuniones fantasma.»

**🧪 Respaldo**: `SUP-03`, `SUP-04`

---

## E31 · Redes territoriales (26:00 – 26:30)

**Ruta**: `/coordinacion/redes`

**Acciones**: recorrer los tres bloques: *Dispositivos Territoriales* (registrar un CESFAM), *Activaciones de Red* (derivar un caso a un dispositivo) y *Actividades Fase 5* (focus group / reunión de equipo).

**Locución**:
> «La integración social no la hace sola una dupla: la hacen las redes del territorio. Acá se mantiene el catálogo de dispositivos —salud, empleo, educación, habitabilidad—, se registra cada derivación concreta de un caso a una institución, y se documentan las actividades grupales de la Fase 5. Ese registro de derivaciones es el que alimenta el indicador de gestión de redes del informe.»

**🧪 Respaldo**: `NET-01`, `NET-02`, `NET-03`

---

## E32 · Alertas automáticas (26:30 – 27:15)

**Ruta**: `/coordinacion` (Resumen Regional) → panel **Casos que Requieren Apoyo Metodológico**

**Acciones**: recargar `/coordinacion` y mostrar que las alertas ya están ahí — no hay un botón que apretar, se recalculan solas cada vez que el coordinador entra al resumen regional. Recorrer los tipos generados:

| Regla | Se dispara cuando |
|---|---|
| Alerta de seguimiento | El caso supera el umbral de días sin Registros de Acompañamiento (10 / 14 / 10 según etapa) |
| Alerta documental (tarea atrasada) | Una tarea pasó su fecha de vencimiento → además cambia a estado `ATRASADA` |
| PER no habilitado | Un PER sin habilitación tiene una tarea crítica asignada |
| Alerta de validación pendiente | Un paso lleva más de 5 días enviado sin que coordinación lo revise |
| Alerta de itinerario estancado | El caso lleva demasiado tiempo en la etapa y el paso actual ni siquiera se inició |

Resolver una alerta escribiendo una nota, ahí mismo en el resumen regional.

**Locución**:
> «Las alertas no dependen de que alguien se acuerde de revisar, y tampoco de que alguien se acuerde de apretar un botón: se recalculan solas cada vez que el coordinador abre su resumen regional. Son cinco reglas automáticas: casos sin encuentros, tareas vencidas, acompañantes sin habilitación con tareas críticas, instrumentos que llevan días esperando revisión de la propia coordinación, y casos estancados en su etapa.
> Fíjense en la cuarta: la plataforma también audita a la coordinación. Si un acompañante entrega y nadie lo revisa en cinco días, salta la alerta. Cada alerta se cierra con una nota de resolución que queda en la auditoría.»

**🧪 Respaldo**: `ALRT-01` … `ALRT-07`

---

# BLOQUE H — Offline, PWA y cierre

## E33 · Trabajo sin conexión (27:15 – 28:15)

**Ventana B** — DevTools → Network → **Offline**.

**Acciones**:
1. Aparece el banner amarillo *«Sin conexión a internet — Los borradores se guardan localmente»*.
2. Llenar un Registro de Acompañamiento → **💾 Guardar Borrador Local** → mostrar en DevTools → Application → Local Storage la clave `per_offline_sessions`.
3. Volver a **Online** → aparece el aviso de borradores pendientes con **🔄 Sincronizar ahora** → presionarlo → el registro se envía.
4. Mostrar que la sincronización es **idempotente**: reintentar no duplica el registro.

**Locución**:
> «El trabajo en terreno no siempre tiene señal. Sin conexión, la aplicación avisa y permite guardar borradores dentro del propio dispositivo. Al recuperar internet, un toque los sincroniza.
> Y hay un detalle importante: cada borrador lleva un identificador propio, así que si la sincronización se reintenta, el registro **no se duplica**. Eso sí: los borradores viven solo en ese dispositivo. Si se cambia de celular antes de sincronizar, se pierden.»

**🧪 Respaldo**: `OFFL-01`, `OFFL-02`, `OFFL-03`, `SESS-07`

---

## E34 · Instalación PWA y notificaciones push (28:15 – 29:00)

**Acciones**: mostrar el ícono de instalación en la barra de direcciones → instalar la app → abrirla en modo standalone. Mostrar el banner de suscripción a notificaciones y aceptar. Desde la ventana A, validar un registro → mostrar la notificación nativa del sistema operativo y que al hacer clic abre la vista exacta.

**Locución**:
> «La aplicación se instala como una app nativa, sin pasar por ninguna tienda, y funciona con su propio ícono en la pantalla de inicio. Con las notificaciones activadas, los avisos llegan al dispositivo aunque la app esté cerrada —y al tocarlos, abren directamente la pantalla que corresponde.»

**🧪 Respaldo**: `PUSH-01`, `PUSH-02`

---

## E35 · Cierre (29:00 – 30:00)

**Pantalla**: volver al diagrama de las 5 fases / 3 etapas.

**Locución**:
> «Repasemos lo que vimos. La plataforma toma el itinerario metodológico del programa PER y lo convierte en un camino que el sistema mismo hace cumplir: un paso a la vez, en el orden correcto, con validación de coordinación entre cada uno, con puertas de avance que exigen tener el trabajo completo, y con la posibilidad de saltárselas solo dejando constancia escrita.
> Alrededor de ese camino: gestión de duplas, supervisión, redes territoriales, alertas automáticas, indicadores del convenio congelables como evidencia, y una bitácora de auditoría que registra absolutamente todo.
> Y con dos principios sostenidos de punta a punta: **la identidad de las personas acompañadas nunca entra al sistema** —solo códigos y alias elegidos por ellas— y **cada acción queda trazada**.
> El manual completo está disponible dentro de la plataforma. Gracias.»

---

## Corte corto (versión ejecutiva, 8–9 min)

Para presentaciones breves, grabar solo estas escenas y unirlas con las transiciones indicadas:

| Orden | Escena | Duración |
|---|---|---|
| 1 | E01 Apertura (recortada a 20 s) | 0:20 |
| 2 | E03 Modo Demo vs. Real | 1:00 |
| 3 | E16 Tablero de itinerario | 1:00 |
| 4 | E17 Ciclo devolver / corregir / validar | 1:00 |
| 5 | E18 Alias de la persona acompañada | 0:45 |
| 6 | E20 Registro de Acompañamiento ligado al objetivo del IAP | 1:00 |
| 7 | E23 + E24 Puerta de avance y forzado auditado | 1:15 |
| 8 | E26 Bloqueo de egreso | 0:45 |
| 9 | E10 Congelar reporte oficial | 0:45 |
| 10 | E35 Cierre (recortado) | 0:30 |

---

## Checklist de grabación

- [ ] Base reseteada con `db push` + `db seed` inmediatamente antes de grabar
- [ ] Ventana A (rol administrativo) y ventana B (incógnito, PER) abiertas y logueadas
- [ ] Vista PER en emulación móvil 390×844
- [ ] Contraseña de modo real **nunca visible ni leída en voz alta**
- [ ] Sin nombres reales de personas acompañadas en pantalla
- [ ] DevTools abierto solo en E33 (offline) y E34 (push)
- [ ] Notificaciones del sistema operativo despejadas antes de E34
- [ ] Todas las pruebas de `PruebasUnitarias.md` en verde antes de grabar

---

## Discrepancias detectadas durante la preparación del guión

Estas inconsistencias entre documentación y código se encontraron al verificar el guión contra el código fuente. Las tres quedaron resueltas en la auditoría de agosto 2026 (ver `PlanDeAccion.md`, rama `fix/auditoria-agosto-2026`):

1. ✅ **Cantidad de cuentas demo** (F12). `Manual.md` §14 declaraba *«13 cuentas»*; ahora dice **16**, alineado con el modal real ([LoginForm.tsx:32](src/components/auth/LoginForm.tsx:32)): 1 Admin, 5 Coordinadores y 10 PER.

2. ✅ **Abreviatura de la región Los Ríos** (F03). `getRegionAbbreviation()` en [cases.service.ts:19](src/server/services/cases.service.ts:19) devuelve ahora `LOS`, igual que el seed. Un caso creado desde la aplicación en Los Ríos sale como `PA-LOS-###`, sin convivir con un prefijo `RIO` distinto.

3. ✅ **Nomenclatura "bitácora" vs. "Registro de Acompañamiento"** (F11). Las notificaciones del sistema en [sessions.service.ts](src/server/services/sessions.service.ts) ahora dicen *«Nuevo Registro de Acompañamiento por validar»*, *«Registro de Acompañamiento validado»* y *«Registro de Acompañamiento devuelto»*, consistente con el resto de la documentación. (La "bitácora de auditoría" de `/admin/auditoria` es un concepto distinto y conserva su nombre.)
