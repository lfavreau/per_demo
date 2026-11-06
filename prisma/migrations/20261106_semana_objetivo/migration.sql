-- Semana del acompañamiento en que se espera lograr cada objetivo de la Actividad 4 (reemplaza al plazo en fecha).
-- Solo agrega una columna opcional, cero datos: segura de aplicar contra una base con datos reales.
-- "deadline" se conserva (legado) para no perder lo ya guardado.
-- Aplicar a mano contra Turso (no pasa por prisma migrate), mismo estilo que
-- prisma/migrations/20260730_itinerario_y_alias/migration.sql. Antes de aplicar: respaldo verificado.
-- Debe estar aplicada ANTES de que Vercel despliegue el código que lee IAPGoal.targetWeek.

ALTER TABLE "IAPGoal" ADD COLUMN "targetWeek" INTEGER;
