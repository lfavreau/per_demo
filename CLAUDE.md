# Guía de Comandos y Estilos (CLAUDE.md)

Este archivo contiene los comandos más habituales de desarrollo, construcción y base de datos para la plataforma PER.

## Comandos de Consola

### Servidor de Desarrollo
```bash
npm run dev
```

### Compilar y levantar en Producción
```bash
npm run build
npm run start
```

### Base de Datos (Prisma ORM)
*   **Actualizar esquema local**: `npx prisma db push`
*   **Generar cliente Prisma**: `npx prisma generate`
*   **Cargar datos de prueba (Seed)**: `npx prisma db seed`
*   **Abrir interfaz visual (Studio)**: `npx prisma studio`

### Calidad y Estilo de Código
*   **Revisión de Lints**: `npx next lint`
*   **Compilación TypeScript**: `npx tsc --noEmit`

---

## Guía de Estilos y Reglas de Desarrollo

1.  **Tecnologías Principales**: Next.js (App Router), TypeScript, Prisma ORM, Vanilla CSS (con Tailwind CSS).
2.  **Manejo de Errores en Server Actions**: Siempre envolver acciones críticas con bloques `try/catch` y propagar redirecciones usando `redirect()` asegurando no tragarse el error especial de Next.js (lanzar `isRedirectError(error)` o verificar excepciones de redirección).
3.  **Privacidad de Datos**: No registrar información confidencial o identificadores personales (Nombres, RUN, Rut) de las Personas Acompañadas. Usar únicamente los códigos correlativos únicos autogenerados por el sistema (ej. `PA-VAL-008`).
4.  **Integración con Google**: Para habilitar la integración real con Google Workspace, configurar la variable de entorno `GOOGLE_APPS_SCRIPT_URL` en `.env.local` con la URL de la Web App desplegada desde `GoogleAppsScript.gs`. De lo contrario, el sistema utilizará de forma segura la simulación local de base de datos.
