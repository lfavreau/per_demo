# Puesta en marcha de Google Workspace

## 1. Propiedades del proyecto Apps Script

En **Configuración del proyecto → Propiedades del script**, conservar o definir:

```text
ROOT_FOLDER_ID
TEMPLATE_DOC_ID
SPREADSHEET_ID
CALENDAR_ID
API_SHARED_SECRET
```

`API_SHARED_SECRET` debe tener al menos 32 caracteres y debe coincidir exactamente
con `GOOGLE_APPS_SCRIPT_SECRET` en Vercel.

La plantilla indicada por `TEMPLATE_DOC_ID` debe ser el IAP oficial, no el
documento vacío creado durante las primeras pruebas.

### Servicio avanzado Drive API (obligatorio)

En el editor de Apps Script: **Servicios (+) → Drive API → Añadir**, identificador `Drive`.
Sin esto, `authorizeWorkspace()` falla a propósito — es lo que permite leer la revisión
real de cada documento (`Drive.Revisions.list`) en vez de guardar un identificador inventado.

### Plantillas de documentos generados (una Script Property por instrumento)

Cada instrumento que la app materializa en Drive al validarse necesita su propia plantilla,
cargada como `TEMPLATE_DOC_{activityKey}`:

```text
TEMPLATE_DOC_PRIMER_ENCUENTRO_REFLEXION
TEMPLATE_DOC_ACTIVIDAD_1_MOTIVACIONES
TEMPLATE_DOC_ACTIVIDAD_2_ANTECEDENTES
TEMPLATE_DOC_ACTIVIDAD_4_PLANIFICACION   # IAP — mismo Doc ID que TEMPLATE_DOC_ID
TEMPLATE_DOC_REGISTRO_ACOMPANAMIENTO
TEMPLATE_DOC_ACTIVIDAD_5_INTERMEDIA
TEMPLATE_DOC_ACTIVIDAD_5_FINAL
TEMPLATE_DOC_ACTIVIDAD_6_REFLEXION_FINAL
TEMPLATE_DOC_FORMULARIO_ABANDONO_PA
TEMPLATE_DOC_FORMULARIO_ABANDONO_PER
```

`TEMPLATE_DOC_ACTIVIDAD_4_PLANIFICACION` es un caso especial: no es una plantilla nueva,
apunta al **mismo Doc ID** que `TEMPLATE_DOC_ID` — el IAP se reescribe en el mismo archivo
que ya se crea al formalizar la dupla, con placeholders `{{TABLA_AMBITOS}}` y
`{{TABLA_OBJETIVOS}}` agregados a esa plantilla existente.

Los placeholders exactos de cada plantilla (campos + tablas) están documentados en el
histórico de la conversación que armó este pipeline; ante la duda, revisar
`GENERATED_DOCUMENTS` en `src/server/services/document-sync.service.ts` — ahí está la
fuente de verdad de qué campo usa cada instrumento.

## 2. Código y despliegue

1. Reemplazar `Code.gs` por el contenido de `GoogleAppsScript.gs`.
2. Guardar el proyecto.
3. Seleccionar `authorizeWorkspace` en el menú de funciones y pulsar
   **Ejecutar** una sola vez. Aceptar los permisos solicitados y comprobar que
   la ejecución termina correctamente (debe incluir `templateRevision` en el resultado —
   si falta, revisar el servicio avanzado Drive de arriba). Esta función no crea recursos.
4. Seleccionar **Deploy → Manage deployments**.
5. Editar el despliegue y seleccionar **New version**.
6. Ejecutar como el usuario que despliega.
7. Permitir acceso externo para que Vercel pueda llamar al Web App.
8. Copiar la URL de producción terminada en `/exec`.

No utilizar la URL de pruebas terminada en `/dev`.
No ejecutar `setupPilotDrive` ni `doPost` manualmente.

> Cargar o cambiar Script Properties **no** requiere un nuevo despliegue — se leen en vivo.
> Solo hace falta repetir los pasos 4-8 cuando cambia el código de `GoogleAppsScript.gs`.

## 3. Variables de Vercel

Configurar como variables sensibles de Production:

```text
AUTH_SESSION_SECRET
REAL_MODE_PASSWORD
GOOGLE_APPS_SCRIPT_URL
GOOGLE_APPS_SCRIPT_SECRET
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
```

Después de modificarlas, crear un nuevo deployment.

## 4. Migraciones de esquema

Antes del nuevo deployment se debe aplicar:

```text
prisma/migrations/20260723_mode_isolation/migration.sql
```

La migración agrega `isDemo` a dispositivos territoriales, snapshots y
notificaciones, y clasifica los registros ya existentes como demostrativos.

Además, para el pipeline de documentos generados, `DocumentRecord` necesita `revisionId`
nullable y las columnas `origin`/`contentHash`/`lastSyncedAt`. Como el datasource de
`prisma.config.ts` apunta fijo a `file:./dev.db` (no a Turso), este cambio no se aplicó con
`prisma migrate` sino generando el diff a mano (`prisma migrate diff --from-schema=<schema
anterior> --to-schema=prisma/schema.prisma --script`) y ejecutándolo contra la base real vía
`turso db shell` — probado primero en una rama descartable de la base (`turso db create
<nombre>-test --from-db <nombre>`) antes de aplicarlo a producción. Si el `DocumentRecord` de
tu Turso todavía no tiene esas columnas, cualquier consulta a documentos validados (no solo
los nuevos generados, también la Encuesta de Satisfacción) va a fallar con
`no such column`.

## 5. Recorrido de prueba real

1. Entrar por el formulario normal, no por un acceso directo Demo.
2. Crear o seleccionar una candidata real.
3. Conformar la dupla (candidata + PER + tipo + fundamentación — ya no pide Acta de Primer
   Encuentro, se formaliza directo).
4. Como PER, completar y enviar "Primer encuentro. Reflexión personal del PER." (u otro
   instrumento habilitado).
5. Como coordinador, validarlo y forzar el avance de etapa (o completar el resto de la etapa
   normalmente).
6. Verificar en la ficha el enlace **Abrir carpeta** y, dentro de Drive, que apareció el
   documento generado (`{código}_Primer_Encuentro` u otro) con los campos ya reemplazados,
   no `{{...}}` sin resolver.
7. Confirmar en Drive la estructura, con el nombre de PER legible (no el ID interno):

```text
Región/
└── PER_{nombre_legible}_{sufijo}/
    └── PA-REG-000/
        ├── 01_Vinculacion/
        │   ├── PA-REG-000_IAP                    (creado vacío al formalizar)
        │   └── PA-REG-000_Primer_Encuentro        (generado al validar el instrumento)
        ├── 02_Conexion/
        ├── 03_Finalizacion/
        └── 99_Validados/
```

8. Repetir la formalización o el envío tras una interrupción simulada y
   confirmar que no aparecen carpetas ni documentos duplicados.
9. Corregir un instrumento ya generado (devolver, corregir, revalidar) y confirmar que el
   documento se reescribe en el **mismo archivo** de Drive (mismo enlace, nueva revisión) en
   vez de crear una copia `_v1`/`_v2`.
