# Plataforma de Coordinación PER 2026-2027

Este proyecto está construido en [Next.js](https://nextjs.org) con TypeScript, Tailwind CSS y Prisma ORM (SQLite local / Turso en producción) para apoyar el Pilotaje de Recuperación Basada en Pares (PER) de SENDA. Etapa actual: **beta**.

## 📖 Documentación (`docs/`)

*   [**Sintesis.md**](docs/Sintesis.md): Punteo condensado del programa y la app, para presentaciones.
*   [**Manual.md**](docs/Manual.md): 📘 **Manual completo** del programa PER y la plataforma. Incluye metodología SENDA, código de ética, 9 ámbitos de recuperación, IAP, técnicas de mapeo, guía de la app por rol, KPIs del convenio, glosario y FAQ.
*   [**Guia.md**](docs/Guia.md): Guía de uso no técnica para PER en terreno y coordinadores con menor familiaridad digital.
*   [**Estructura.md**](docs/Estructura.md): Arquitectura de archivos, base de datos y especificaciones por vista y rol.

*   [**Resumen.md**](public/Resumen.md): Fundamentación metodológica por fases (se publica en la app, enlazado desde el login).

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
