# Plataforma de Coordinación PER 2026-2027

Este proyecto está construido en [Next.js](https://nextjs.org) con TypeScript, Tailwind CSS y Prisma ORM (SQLite/PostgreSQL) para apoyar el Pilotaje de Recuperación Basada en Pares (PER) de SENDA.

## 📖 Guías del Proyecto

Para entender a fondo el software y el programa PER, consulta los siguientes manuales de referencia:
*   [**Estructura.md**](file:///c:/Users/admn/Desktop/apps/per/alpha/Estructura.md): Detalla la arquitectura de archivos del proyecto, la base de datos relacional y las especificaciones por vista y rol.
*   [**Guia.md**](file:///c:/Users/admn/Desktop/apps/per/alpha/Guia.md): Una guía de uso no técnica redactada para los acompañantes PER en terreno y coordinadores regionales con menor familiaridad digital.
*   [**Resumen.md**](file:///c:/Users/admn/Desktop/apps/per/alpha/public/Resumen.md): Explica la fundamentación técnica y metodológica por fases del programa PER y su integración con Google Drive/Forms.

---

## Desarrollo Local

Primero, inicia el servidor de desarrollo:

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

### Construcción para Producción

Para compilar y empaquetar la aplicación en modo optimizado de producción:

```bash
npm run build
npm run start
```

