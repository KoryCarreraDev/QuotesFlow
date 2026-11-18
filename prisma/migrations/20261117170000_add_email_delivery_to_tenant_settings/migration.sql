-- D-57 (F3-T10): canal de correo por empresa, desactivado por defecto. Las empresas existentes quedan sin correo.

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "emailDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;
