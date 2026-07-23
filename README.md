# Plataforma de Coordinación PER 2026-2027

Este proyecto está construido en [Next.js](https://nextjs.org) con TypeScript, Tailwind CSS y Prisma ORM (SQLite/PostgreSQL) para apoyar el Pilotaje de Recuperación Basada en Pares (PER) de SENDA.

## 📖 Guías del Proyecto

Para entender a fondo el software y el programa PER, consulta los siguientes manuales de referencia:
*   [**Manual.md**](Manual.md): 📘 **Manual completo** del programa PER y la plataforma. Incluye metodología SENDA, código de ética, 9 ámbitos de recuperación, IAP, técnicas de mapeo, guía de la app por rol, KPIs del convenio, glosario y FAQ.
*   [**Guia.md**](Guia.md): Guía de uso no técnica para PER en terreno y coordinadores con menor familiaridad digital.
*   [**Estructura.md**](Estructura.md): Arquitectura de archivos, base de datos relacional y especificaciones por vista y rol.
*   [**Resumen.md**](public/Resumen.md): Fundamentación técnica y metodológica por fases del programa PER y su integración con Google Workspace.

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

