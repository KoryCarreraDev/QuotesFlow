-- F3-T05: cotizaciones con numeración consecutiva por empresa, versiones (D-22), vigencia (D-23), precio manual con
-- motivo (D-24), descuento global y por ítem con topes por rol (D-25, Q-019) e IVA por ítem (D-20, Q-020).
-- Las cotizaciones anteriores (no había API para crearlas) se completan con valores por defecto antes de exigirlos.

-- El antiguo "discount" no tenía un significado definido (importe o porcentaje): si alguna cotización lo usa, la
-- migración se detiene en lugar de perder ese dato en silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Quote" WHERE "discount" IS NOT NULL) THEN
    RAISE EXCEPTION 'Quote.discount has data: migrate it by hand before applying add_quote_details';
  END IF;
END $$;

-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'SUPERSEDED';

-- AlterTable
ALTER TABLE "Quote" DROP COLUMN "discount",
ADD COLUMN     "companyContactId" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "discountTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "validUntil" DATE,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Cotizaciones previas: número por orden de creación dentro de su empresa y vigencia de 30 días.
UPDATE "Quote" AS quote
SET "number" = numbered.position
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "createdAt", "id") AS position FROM "Quote"
) AS numbered
WHERE quote."id" = numbered."id";
UPDATE "Quote" SET "validUntil" = ("createdAt" + INTERVAL '30 days')::date WHERE "validUntil" IS NULL;

ALTER TABLE "Quote" ALTER COLUMN "number" SET NOT NULL,
ALTER COLUMN "validUntil" SET NOT NULL;

-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "calculatedUnitPrice" DECIMAL(65,30),
ADD COLUMN     "discountRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "priceOverrideReason" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Ítems previos: orden por id dentro de su cotización, sin IVA y con el precio unitario deducido del total.
UPDATE "QuoteItem" AS item
SET "position" = numbered.position
FROM (SELECT "id", ROW_NUMBER() OVER (PARTITION BY "quoteId" ORDER BY "id") AS position FROM "QuoteItem") AS numbered
WHERE item."id" = numbered."id";
UPDATE "QuoteItem" SET "unitPrice" = COALESCE("total" / NULLIF("quantity", 0), 0) WHERE "unitPrice" IS NULL;

ALTER TABLE "QuoteItem" ALTER COLUMN "position" SET NOT NULL,
ALTER COLUMN "unitPrice" SET NOT NULL,
ALTER COLUMN "taxRate" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "defaultTaxRate" DECIMAL(5,2),
ADD COLUMN     "maximumDiscountRateSalesLeader" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "maximumDiscountRateSalesRep" DECIMAL(5,2) NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "QuoteNumberSequence" (
    "tenantId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteNumberSequence_pkey" PRIMARY KEY ("tenantId")
);

-- La secuencia de cada empresa empieza tras su último número usado.
INSERT INTO "QuoteNumberSequence" ("tenantId", "lastNumber")
SELECT "tenantId", MAX("number") FROM "Quote" GROUP BY "tenantId";

-- CreateIndex
CREATE UNIQUE INDEX "Quote_previousVersionId_key" ON "Quote"("previousVersionId");

-- CreateIndex
CREATE INDEX "Quote_tenantId_createdById_idx" ON "Quote"("tenantId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_tenantId_number_version_key" ON "Quote"("tenantId", "number", "version");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_companyContactId_fkey" FOREIGN KEY ("companyContactId") REFERENCES "CompanyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteNumberSequence" ADD CONSTRAINT "QuoteNumberSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
