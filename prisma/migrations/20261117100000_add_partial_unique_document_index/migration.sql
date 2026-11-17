-- F2-T09 (F1-S2, D-19): un documento no se repite entre clientes activos del mismo tenant.
-- Hasta ahora lo comprobaba solo la aplicación y dos altas simultáneas podían pasar las dos.
-- Índice único parcial: los clientes borrados quedan fuera para poder reutilizar su documento.

-- Si ya hay duplicados (altas simultáneas antes de este índice), se detiene con un mensaje claro en lugar
-- del error genérico de PostgreSQL. Operaciones debe resolverlos a mano antes de reintentar (R6).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Contact"
    WHERE deleted = 'INUSE' AND "documentNumber" IS NOT NULL
    GROUP BY "tenantId", "documentNumber" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'F2-T09: hay contactos activos con el mismo documento en un tenant; resolverlos antes de migrar';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CompanyContact"
    WHERE deleted = 'INUSE' AND "documentNumber" IS NOT NULL
    GROUP BY "tenantId", "documentNumber" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'F2-T09: hay empresas cliente activas con el mismo NIT en un tenant; resolverlas antes de migrar';
  END IF;
END $$;

-- DropIndex
DROP INDEX "CompanyContact_tenantId_documentNumber_idx";

-- DropIndex
DROP INDEX "Contact_tenantId_documentNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CompanyContact_tenantId_documentNumber_active_key" ON "CompanyContact"("tenantId", "documentNumber") WHERE (deleted = 'INUSE'::"DeletedState") AND ("documentNumber" IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_documentNumber_active_key" ON "Contact"("tenantId", "documentNumber") WHERE (deleted = 'INUSE'::"DeletedState") AND ("documentNumber" IS NOT NULL);
