-- F3-A10: comprobación, sin cambiar datos, de que las cotizaciones guardadas cumplen las reglas que el dominio exige
-- al leerlas. Si no, `GET /quotes/search` respondería 400 para toda la empresa. No hay API anterior a F3 que las
-- creara, así que en un entorno limpio esta migración no hace nada; si encuentra filas inválidas, se detiene con un
-- mensaje que dice cuáles corregir a mano antes de aplicarla.
--
-- Es una migración nueva y no un cambio a `add_quote_details`, que ya se aplicó en el entorno local: editar una
-- migración aplicada rompe su suma de comprobación.

DO $$
DECLARE
  quotes_without_customer INTEGER;
  items_with_invalid_quantity INTEGER;
  items_with_negative_price INTEGER;
  quotes_with_too_many_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO quotes_without_customer FROM "Quote"
  WHERE "deleted" = 'INUSE' AND "leadId" IS NULL AND "contactId" IS NULL AND "companyContactId" IS NULL;

  SELECT COUNT(*) INTO items_with_invalid_quantity FROM "QuoteItem"
  WHERE "deleted" = 'INUSE' AND ("quantity" < 1 OR "quantity" > 1000000);

  SELECT COUNT(*) INTO items_with_negative_price FROM "QuoteItem"
  WHERE "deleted" = 'INUSE' AND "unitPrice" < 0;

  SELECT COUNT(*) INTO quotes_with_too_many_items FROM (
    SELECT "quoteId" FROM "QuoteItem" WHERE "deleted" = 'INUSE' GROUP BY "quoteId" HAVING COUNT(*) > 200
  ) AS crowded;

  IF quotes_without_customer + items_with_invalid_quantity + items_with_negative_price + quotes_with_too_many_items > 0 THEN
    RAISE EXCEPTION
      'Quote rows break the domain rules; fix them by hand before applying: % quotes without lead, contact or company, % items with quantity outside 1..1000000, % items with negative price, % quotes with more than 200 items',
      quotes_without_customer, items_with_invalid_quantity, items_with_negative_price, quotes_with_too_many_items;
  END IF;
END $$;
