-- F1-T17: comercial responsable y documento normalizado en contactos y empresas cliente (D-18, D-19).
-- Los clientes previos quedan sin responsable hasta que el dueño o el líder los asigne (Q-005, opción B).

CREATE TYPE "DocumentType" AS ENUM ('CC', 'CE', 'TI', 'PASSPORT', 'PPT', 'NIT');

ALTER TABLE "Contact" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "documentType" "DocumentType";
ALTER TABLE "Contact" ADD COLUMN "documentNumber" TEXT;

ALTER TABLE "CompanyContact" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "CompanyContact" ADD COLUMN "documentNumber" TEXT;

-- NIT ya cargado: se quita el dígito de verificación (lo que sigue al último guion) y todo lo que no es dígito.
UPDATE "CompanyContact"
   SET "documentNumber" = NULLIF(
         regexp_replace(regexp_replace("taxNumber", '-[^-]*$', ''), '[^0-9]', '', 'g'),
         ''
       )
 WHERE "taxNumber" IS NOT NULL;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyContact"
  ADD CONSTRAINT "CompanyContact_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Contact_ownerId_idx" ON "Contact"("ownerId");
CREATE INDEX "Contact_tenantId_documentNumber_idx" ON "Contact"("tenantId", "documentNumber");
CREATE INDEX "CompanyContact_ownerId_idx" ON "CompanyContact"("ownerId");
CREATE INDEX "CompanyContact_tenantId_documentNumber_idx" ON "CompanyContact"("tenantId", "documentNumber");
