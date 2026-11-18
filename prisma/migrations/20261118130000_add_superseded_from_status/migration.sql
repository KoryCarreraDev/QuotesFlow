-- F3-A03: al reemplazar una cotización por su versión siguiente se guarda el estado que tenía (SENT o REJECTED).
-- Borrar el borrador de esa versión nueva restaura la anterior a ese estado en vez de dejarla reemplazada para
-- siempre. Es una columna nueva y opcional: las cotizaciones existentes no necesitan relleno.

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "supersededFromStatus" "QuoteStatus";
