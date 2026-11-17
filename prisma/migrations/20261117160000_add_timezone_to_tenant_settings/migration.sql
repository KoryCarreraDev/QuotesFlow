-- F2-T06: zona horaria de la empresa (por defecto America/Bogota) y configuración para toda empresa.

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/Bogota';


-- Las empresas registradas antes de F2-T06 no tenían configuración: se les crea con los valores por defecto.
INSERT INTO "TenantSettings" ("id", "tenantId")
SELECT gen_random_uuid()::text, "Tenant"."id"
FROM "Tenant"
WHERE NOT EXISTS (SELECT 1 FROM "TenantSettings" WHERE "TenantSettings"."tenantId" = "Tenant"."id");
