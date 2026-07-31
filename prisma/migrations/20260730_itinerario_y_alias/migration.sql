-- Itinerario secuencial de instrumentos por etapa + alias de la persona acompanada.
-- Solo cambia esquema, cero datos. Segura de aplicar contra una base con datos reales existentes.
-- Aplicar a mano contra Turso (no pasa por prisma migrate), mismo estilo que
-- prisma/migrations/20260723_mode_isolation/migration.sql.

ALTER TABLE "Instrument" ADD COLUMN "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Instrument" ADD COLUMN "activityKey" TEXT;
ALTER TABLE "Instrument" ADD COLUMN "submissionMode" TEXT NOT NULL DEFAULT 'EXTERNAL_LINK';
ALTER TABLE "Instrument" ADD COLUMN "optional" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Instrument" ADD COLUMN "triggerCondition" TEXT NOT NULL DEFAULT 'SEQUENTIAL';
CREATE INDEX "Instrument_stageId_order_idx" ON "Instrument"("stageId", "order");

ALTER TABLE "Task" ADD COLUMN "contentJson" TEXT;
ALTER TABLE "Task" ADD COLUMN "iterationNumber" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "Task_paCaseId_instrumentId_iterationNumber_key" ON "Task"("paCaseId", "instrumentId", "iterationNumber");

ALTER TABLE "IAPDomainMap" ADD COLUMN "taskId" TEXT;
ALTER TABLE "IAPGoal" ADD COLUMN "taskId" TEXT;
ALTER TABLE "IAPGoal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "IAPGoal" ADD COLUMN "isCurrent" BOOLEAN NOT NULL DEFAULT true;

-- Alias opcional de la persona acompanada (nunca nombre legal ni RUN)
ALTER TABLE "PACase" ADD COLUMN "alias" TEXT;
