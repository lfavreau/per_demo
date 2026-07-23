ALTER TABLE "ReportSnapshot" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NetworkDevice" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Notification" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- La base existente corresponde al poblamiento demostrativo. Los registros
-- creados después de esta migración heredarán el modo de la sesión.
UPDATE "ReportSnapshot" SET "isDemo" = true;
UPDATE "NetworkDevice" SET "isDemo" = true;
UPDATE "Notification" SET "isDemo" = true;
