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

## 2. Código y despliegue

1. Reemplazar `Code.gs` por el contenido de `GoogleAppsScript.gs`.
2. Guardar el proyecto.
3. Seleccionar `authorizeWorkspace` en el menú de funciones y pulsar
   **Ejecutar** una sola vez. Aceptar los permisos solicitados y comprobar que
   la ejecución termina correctamente. Esta función no crea recursos.
4. Seleccionar **Deploy → Manage deployments**.
5. Editar el despliegue y seleccionar **New version**.
6. Ejecutar como el usuario que despliega.
7. Permitir acceso externo para que Vercel pueda llamar al Web App.
8. Copiar la URL de producción terminada en `/exec`.

No utilizar la URL de pruebas terminada en `/dev`.
No ejecutar `setupPilotDrive` ni `doPost` manualmente.

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

## 4. Migración de separación demo/real

Antes del nuevo deployment se debe aplicar:

```text
prisma/migrations/20260723_mode_isolation/migration.sql
```

La migración agrega `isDemo` a dispositivos territoriales, snapshots y
notificaciones, y clasifica los registros ya existentes como demostrativos.

## 5. Recorrido de prueba real

1. Entrar por el formulario normal, no por un acceso directo Demo.
2. Crear o seleccionar una candidata real.
3. Proponer y validar la dupla.
4. Entregar un enlace real al Acta de Primer Encuentro.
5. Formalizar.
6. Verificar en la ficha los enlaces **Abrir carpeta**, **Abrir IAP** y
   **Abrir Acta**.
7. Confirmar en Drive una sola estructura:

```text
Región/
└── PER_{id}/
    └── PA-REG-000/
        ├── 01_Vinculacion/
        │   ├── PA-REG-000_Acta_Primer_Encuentro
        │   └── PA-REG-000_IAP_v01
        ├── 02_Conexion/
        ├── 03_Finalizacion/
        └── 99_Validados/
```

8. Repetir la formalización o el envío tras una interrupción simulada y
   confirmar que no aparecen carpetas ni documentos duplicados.
