-- H15 (F1-T10): LeadStatusHistory y QuoteItem no tenían tenantId (regla R5).
-- Hoy nada escribe en esas tablas, pero la migración no lo da por hecho: rellena el tenant desde el
-- registro padre antes de exigir NOT NULL, así se puede aplicar sobre una base con datos.

-- LeadStatusHistory: el tenant es el de su lead.
ALTER TABLE "LeadStatusHistory" ADD COLUMN "tenantId" TEXT;

UPDATE "LeadStatusHistory" AS history
   SET "tenantId" = lead."tenantId"
  FROM "Lead" AS lead
 WHERE lead."id" = history."leadId";

ALTER TABLE "LeadStatusHistory" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "LeadStatusHistory_tenantId_idx" ON "LeadStatusHistory"("tenantId");

ALTER TABLE "LeadStatusHistory"
  ADD CONSTRAINT "LeadStatusHistory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- QuoteItem: el tenant es el de su cotización.
ALTER TABLE "QuoteItem" ADD COLUMN "tenantId" TEXT;

UPDATE "QuoteItem" AS item
   SET "tenantId" = quote."tenantId"
  FROM "Quote" AS quote
 WHERE quote."id" = item."quoteId";

ALTER TABLE "QuoteItem" ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "QuoteItem_tenantId_idx" ON "QuoteItem"("tenantId");

ALTER TABLE "QuoteItem"
  ADD CONSTRAINT "QuoteItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
