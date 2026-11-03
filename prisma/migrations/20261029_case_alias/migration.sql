-- Alias opcional de la persona acompañada. Solo se muestra en las vistas de la
-- app; Drive, notificaciones y reportes siguen usando el código PA-REG-NNN.
ALTER TABLE "PACase" ADD COLUMN "alias" TEXT;
