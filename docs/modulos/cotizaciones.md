# Cotizaciones

> F3-T05. Cotizaciones de cada empresa: numeración consecutiva, precios calculados en el servidor, descuentos con
> topes por rol, IVA, vigencia, estados y versiones. El PDF (F3-T06), el envío por correo (F3-T08) y la creación
> desde un lead (F3-T09) se montan sobre este módulo.

## Propósito
Que un comercial arme una oferta para un lead, un contacto o una empresa cliente, con importes exactos que el
servidor calcula y que no cambian después de enviada.

## Reglas de negocio
- **Cliente.** Una cotización lleva un lead, un contacto, una empresa cliente, o varios a la vez; al menos uno
  (`400 QUOTE_CUSTOMER_REQUIRED`). Un comercial solo cotiza a lo que es suyo (D-18); lo que no existe, es de otra
  empresa o es de otro comercial responde igual, `400 INVALID_QUOTE_CUSTOMER`, para no revelar que existe.
- **Número (D-22, Q-018).** Consecutivo por empresa, sin huecos aunque haya altas simultáneas o una transacción
  revertida (tabla `QuoteNumberSequence`, `INSERT ... ON CONFLICT DO UPDATE` dentro de la transacción de alta).
  Se muestra `COT-000123`. Las versiones comparten número: `COT-000123 v2`.
- **Precio de cada ítem (D-24).** Lo calcula el servidor: el precio fijo del producto o su fórmula evaluada con las
  `variables` del ítem (solo se guardan las que la fórmula declara). El cliente de la API no fija el precio de un
  ítem con producto: si envía `unitPrice` distinto del calculado, es un cambio manual y exige
  `priceOverrideReason` (`400 PRICE_OVERRIDE_REASON_REQUIRED`). El ítem guarda `calculatedUnitPrice` y `unitPrice`;
  `isPriceOverridden` lo indica. El cambio queda en la auditoría como `QUOTE_PRICE_OVERRIDDEN` (con las posiciones
  de los ítems, no el motivo). La alerta al líder llega con F4-T06 (Q-015). Un ítem sin producto necesita
  `description` y `unitPrice` (`400 ITEM_PRICE_REQUIRED`). Un producto inactivo, borrado o de otra empresa responde
  `400 PRODUCT_NOT_AVAILABLE`.
- **Importes.** Todo es dinero exacto (`docs/modulos/dinero.md`): precios antes de IVA, como texto decimal. Orden:
  descuento del ítem, después el descuento global sobre lo que queda, y el IVA sobre esa base. Cada porcentaje se
  redondea a centavos por ítem, así que los totales son la suma exacta de los ítems. Los importes guardados en la
  base (`subtotal`, `discountTotal`, `taxTotal`, `total`, `netAmount`…) son una instantánea: no dependen de que el
  producto o la fórmula cambien después.
- **IVA (D-20, Q-020).** Por ítem. Si no envía `taxRate`, se usa el IVA por defecto de la empresa
  (`TenantSettings.defaultTaxRate`, que configuran dueño y socio en `PATCH /tenant`); si la empresa no lo
  configuró, se pide en cada ítem (`400 TAX_RATE_REQUIRED`).
- **Descuentos (D-25, Q-019).** Porcentaje por ítem y global. Tope por rol sobre el descuento total de cada ítem
  (el suyo y el global seguidos): comercial 10 %, líder comercial 20 % por defecto, dueño y socio sin tope; los
  topes los configuran dueño y socio (`maximumDiscountRateSalesRep`, `maximumDiscountRateSalesLeader`). Superarlo
  responde `403 DISCOUNT_ABOVE_ROLE_LIMIT`. Se comprueba al crear, al modificar (también si solo cambia el global) y **al enviar**, con el tope vigente de quien envía: si el dueño baja el tope o un líder edita el borrador, el comercial no puede enviar un descuento que ya no le corresponde (F3-A05).
- **Vigencia (D-23).** `validUntil` es el último día válido (`AAAA-MM-DD`) en la zona horaria de la empresa; por
  defecto 30 días desde hoy. No puede estar en el pasado al crear o modificar (`400 INVALID_VALIDITY_DATE`) ni al
  enviar (`409 QUOTE_EXPIRED`).
- **Estados.**
  - `DRAFT`: se edita y borra libremente.
  - `SENT`: ya no se edita ni se borra (D-22). Se acepta o rechaza.
  - `ACCEPTED`: definitiva.
  - `REJECTED`: se puede revisar.
  - `SUPERSEDED`: tiene una versión más reciente; solo lectura.
  - `EXPIRED` **no se guarda** (Q-016): `displayStatus` lo calcula al leer para una `SENT` con la vigencia pasada.
    Una vencida no se acepta (`409 QUOTE_EXPIRED`) pero sí se rechaza o se revisa. F4 la guardará con una tarea
    diaria.
- **Revisar (D-22).** `POST /quotes/:id/revise` sobre una enviada, rechazada o vencida crea la versión siguiente
  en borrador (mismo número, mismos datos) y deja la anterior en `SUPERSEDED`. Dos revisiones simultáneas: una gana
  y la otra recibe `409`.
- **Cambios de estado atómicos.** Se guardan comparando y cambiando el estado esperado: aceptar y rechazar a la vez
  no pueden ganar las dos (`409 QUOTE_INVALID_TRANSITION` para quien llega tarde).
- **Permisos** (`docs/security/matriz-permisos.md`): todos crean; un comercial lista, lee, modifica, borra, envía,
  decide y revisa solo las que creó; dueño, socio y líder, todas las de la empresa. Una cotización ajena responde
  `403`; una de otra empresa o inexistente, `404 QUOTE_NOT_FOUND`.
- **Auditoría** en la misma transacción: `QUOTE_CREATED`, `QUOTE_UPDATED` (nombres de campos), `QUOTE_DELETED`,
  `QUOTE_SENT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `QUOTE_REVISED`, `QUOTE_PRICE_OVERRIDDEN`.
- **Desde un lead (F3-T09).** `POST /leads/:id/quotes` crea el borrador con el lead de la ruta como cliente (un
  `leadId` en el cuerpo se ignora; se pueden añadir `contactId` y `companyContactId`). Un comercial solo de los leads
  de los que es responsable (`403` si no; también los que no tienen responsable); gestión, de cualquiera. Un lead
  inexistente, borrado o de otra empresa responde `404 LEAD_NOT_FOUND`. Después aplican las mismas reglas que al
  crear (precio en el servidor, IVA, topes de descuento, numeración).
- **Lead ganado al aceptar (F3-T09).** `POST /quotes/:id/accept` con `{ "markLeadAsWon": true }` y una cotización de
  un lead mueve ese lead al estado ganado de la empresa (el de tipo `WON` con menor orden) en la misma transacción,
  con la nota "Cotización COT-000123 aceptada" en su historial de estados y `LEAD_STATUS_CHANGED` en la auditoría.
  La respuesta lleva `leadMarkedAsWon`. Por defecto (sin el campo) el lead no se toca: pasar a ganado es una
  decisión de quien acepta. Solo se mueve un lead abierto: uno ya ganado o perdido no cambia, y sin ningún estado
  `WON` configurado se acepta igual con `leadMarkedAsWon: false`. Si quien acepta no puede modificar ese lead
  (por ejemplo, se lo reasignaron a otro comercial), responde `403` y la cotización **no** se acepta.
- **PDF (F3-T06).** `GET /quotes/:id/pdf` descarga la cotización en A4 (`application/pdf`, adjunto `COT-000123.pdf` o `COT-000123-v2.pdf`, `Cache-Control: private, no-store`). Lleva el logo (si la empresa tiene uno válido; si falta o no se puede leer, sale sin él), el nombre de la empresa, referencia, estado (`BORRADOR`, `ENVIADA`, `VENCIDA`…), fecha de emisión y vigencia (dd/mm/aaaa en la zona horaria de la empresa), el cliente, la tabla de ítems (con las medidas de los ítems de fórmula), descuentos, IVA y total en pesos colombianos (`$ 1.234.567,50`), notas y condiciones. Los importes se formatean desde el texto decimal exacto, nunca con `number`. La tabla continúa en páginas nuevas con su cabecera repetida y cada página lleva "Página X de Y". Las fuentes estándar solo codifican WinAnsi: un carácter fuera de él (emojis, símbolos) sale como `?`. Los datos de contacto del cliente solo salen si quien descarga puede ver a ese cliente. Se genera al pedirlo y no se guarda. Mismos permisos que leer la cotización (`quote:list`). Cada descarga que sale bien queda auditada como `QUOTE_PDF_DOWNLOADED` (con la versión), porque H13 audita también las descargas; el PDF que va adjunto en el envío por correo no cuenta como descarga y queda cubierto por `QUOTE_SENT`. Las condiciones son un texto fijo; las plantillas por empresa (C-13) no están en el MVP.
- **Envío (F3-T08, D-57).** `POST /quotes/:id/send` deja la cotización `SENT` y responde la cotización con `emailed`.
  - Canal de correo de la empresa **desactivado** (por defecto): solo cambia el estado (`emailed: false`) y el
    comercial comparte el PDF por su cuenta; no se genera el PDF ni sale correo, aunque se envíe `recipientEmail`.
  - Canal **activado**: antes de cambiar el estado se manda al cliente un correo (plantilla `QUOTE_SENT`) con el PDF
    adjunto, ya con el estado `ENVIADA`. Destinatario: `recipientEmail` si viene en el cuerpo y, si no, el correo del
    contacto, de la empresa cliente o del lead, en ese orden. Sin ninguno: `400 QUOTE_RECIPIENT_REQUIRED`. Si el
    proveedor de correo no lo acepta: `503 QUOTE_EMAIL_FAILED` y la cotización **sigue en borrador**, así que "enviada"
    significa que el cliente la recibió; se puede reintentar. Nada se envía si la cotización no se puede enviar
    (ya enviada, vencida, sin ítems). El envío queda en `EmailLog` (destinatario y estado, sin el cuerpo) y la
    auditoría `QUOTE_SENT` lleva `emailed` pero no el correo del cliente.
  - Límite conocido: el correo sale antes de guardar el estado; si dos envíos de la misma cotización coinciden, el
    cliente puede recibir dos correos y el segundo guardado responde `409`.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/quotes/search` | Todos (comercial: las suyas) | Busca, filtra, ordena y pagina (`docs/modulos/filtrado.md`) |
| GET | `/api/v1/quotes/:id` | Ídem | Una cotización con sus ítems |
| GET | `/api/v1/quotes/:id/pdf` | Ídem | Descarga el PDF de la cotización |
| POST | `/api/v1/quotes` | Todos | Crea un borrador → 201 |
| POST | `/api/v1/leads/:id/quotes` | Gestión; comercial: sus leads | Crea un borrador para un lead (F3-T09) → 201 |
| PATCH | `/api/v1/quotes/:id` | Ídem | Modifica un borrador; `items` reemplaza todos los ítems; `null` quita cliente o notas |
| DELETE | `/api/v1/quotes/:id` | Ídem | Borrado suave de un borrador |
| POST | `/api/v1/quotes/:id/send` | Ídem | Borrador → `SENT`; cuerpo opcional `{ recipientEmail? }`; con el correo activo, envía el PDF al cliente |
| POST | `/api/v1/quotes/:id/accept` | Ídem | `SENT` vigente → `ACCEPTED`; cuerpo opcional `{ markLeadAsWon? }` |
| POST | `/api/v1/quotes/:id/reject` | Ídem | `SENT` (también vencida) → `REJECTED` |
| POST | `/api/v1/quotes/:id/revise` | Ídem | Crea la versión siguiente → 201 |

Filtros: `id`, `leadId`, `contactId`, `companyContactId`, `createdById` (`id`, equals/in) · `number` (`number`) ·
`status` (estado guardado, equals/in; un valor desconocido responde `400 INVALID_FILTER_VALUE`) · `total`
(`number`) · `validUntil`, `createdAt` (`date`). Ordenables: `number`, `status`, `total`, `validUntil`,
`createdAt`. Un comercial no puede ver las de otro filtrando por `createdById`: el servidor lo sustituye por el suyo.

## Ejemplos
### Crear una cotización con un producto de fórmula y un servicio
```http
POST /api/v1/quotes
Content-Type: application/json

{
  "contactId": "…",
  "validUntil": "2026-12-31",
  "discountRate": "5",
  "items": [
    { "productId": "…", "quantity": 2, "variables": { "ancho": "1.20", "alto": "1.50" } },
    { "description": "Instalación", "quantity": 1, "unitPrice": "150000", "taxRate": "19" }
  ]
}
```
Respuesta `201` (resumen):
```json
{
  "id": "…", "number": 12, "reference": "COT-000012", "version": 1,
  "status": "DRAFT", "displayStatus": "DRAFT", "validUntil": "2026-12-31", "discountRate": "5.00",
  "items": [ { "position": 1, "calculatedUnitPrice": "810000.00", "unitPrice": "810000.00", "isPriceOverridden": false, "…": "…" } ],
  "subtotal": "…", "discountTotal": "…", "taxTotal": "…", "total": "…"
}
```

### Cambiar a mano el precio calculado
```json
{ "productId": "…", "quantity": 1, "unitPrice": "400000", "priceOverrideReason": "Cliente frecuente" }
```
Sin `priceOverrideReason`: `400 PRICE_OVERRIDE_REASON_REQUIRED`.

Errores: `400 VALIDATION_FAILED`, `400 QUOTE_CUSTOMER_REQUIRED`, `400 INVALID_QUOTE_CUSTOMER`,
`400 INVALID_VALIDITY_DATE`, `400 PRODUCT_NOT_AVAILABLE`, `400 ITEM_PRICE_REQUIRED`,
`400 PRICE_OVERRIDE_REASON_REQUIRED`, `400 TAX_RATE_REQUIRED`, `400 INVALID_FORMULA_VARIABLE`, `400 INVALID_QUANTITY`,
`403 DISCOUNT_ABOVE_ROLE_LIMIT`, `403 INSUFFICIENT_PERMISSIONS`, `404 QUOTE_NOT_FOUND`, `409 QUOTE_NOT_EDITABLE`,
`409 QUOTE_INVALID_TRANSITION`, `409 QUOTE_EXPIRED`.
