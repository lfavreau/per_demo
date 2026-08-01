-- El código de caso pasa a ser único POR MODO (demo/real) en vez de global.
-- Motivo: con unicidad global, el contador que genera el correlativo debía incluir
-- los casos demo, y el primer caso real de una región heredaba su numeración.
-- Solo cambia índices, cero datos. Segura contra bases con datos existentes
-- siempre que no haya un mismo `code` repetido dentro del mismo `isDemo`.

DROP INDEX IF EXISTS "PACase_code_key";
CREATE UNIQUE INDEX "PACase_code_isDemo_key" ON "PACase"("code", "isDemo");
