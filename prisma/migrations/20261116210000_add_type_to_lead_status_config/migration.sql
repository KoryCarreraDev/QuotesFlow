-- D-51 (F1-T14): cada estado de lead declara si el lead sigue abierto, se ganó o se perdió.
CREATE TYPE "LeadStatusType" AS ENUM ('OPEN', 'WON', 'LOST');

ALTER TABLE "LeadStatusConfig" ADD COLUMN "type" "LeadStatusType" NOT NULL DEFAULT 'OPEN';

-- Los estados por defecto que crea el registro (`defaultLeadStatuses`) se llaman Ganado y Perdido.
-- Un estado renombrado por la empresa queda como OPEN y su dueño puede corregirlo.
UPDATE "LeadStatusConfig" SET "type" = 'WON' WHERE "name" = 'Ganado';
UPDATE "LeadStatusConfig" SET "type" = 'LOST' WHERE "name" = 'Perdido';
