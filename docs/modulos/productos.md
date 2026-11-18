# Productos

> F3-T02. Catálogo de productos y servicios de cada empresa, base de las cotizaciones (F3-T05).

## Propósito
Lo que vende la empresa, con su precio unitario fijo o con una fórmula de precio (F3-T04) que el comercial completa
al cotizar (por ejemplo, ancho y alto de una ventana).

## Reglas de negocio
- Un producto tiene precio fijo, fórmula o ambos; nunca ninguno (`400 PRODUCT_PRICE_REQUIRED`). La regla se
  comprueba también después de una modificación parcial: quitar el precio a un producto sin fórmula falla.
- Con fórmula, el precio sale de la fórmula al cotizar; el precio fijo queda como referencia.
- La fórmula tiene que ser de la misma empresa y no estar borrada (`400 INVALID_PRODUCT_FORMULA`).
- El precio es unitario y **antes de IVA** (Q-020); el IVA se suma en la cotización. Dinero exacto como texto
  decimal (`docs/modulos/dinero.md`).
- `isActive: false` lo retira de las cotizaciones nuevas sin borrarlo.
- Borrado suave: las cotizaciones que ya lo usan guardan su propia copia del ítem (F3-T05) y no cambian.
- Permisos (`docs/security/matriz-permisos.md`): todo el equipo consulta el catálogo; dueño, socio y líder
  comercial crean, modifican y borran. **Supuesto pendiente de confirmar por el dueño de producto**: es el mismo
  criterio que la configuración de estados de lead.
- Toda modificación se audita en la misma transacción (`PRODUCT_CREATED`, `PRODUCT_UPDATED` con los nombres de
  los campos cambiados, `PRODUCT_DELETED`).

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/products/search` | Todos | Busca, filtra, ordena y pagina (`docs/modulos/filtrado.md`) |
| POST | `/api/v1/products` | Gestión | Crea un producto → 201 |
| PATCH | `/api/v1/products/:id` | Gestión | Modificación parcial; `null` quita `description`, `basePrice` o `formulaId` |
| DELETE | `/api/v1/products/:id` | Gestión | Borrado suave |

Filtros: `id`, `formulaId` (`id`, equals/in) · `name`✔, `description`✔ (texto) · `basePrice` (`money`: importe en texto decimal, F3-A11) ·
`isActive` (`boolean`, equals) · `createdAt` (`date`). Ordenables: `name`, `basePrice`, `createdAt`.

## Ejemplos
### Crear un producto con precio fijo
```http
POST /api/v1/products
Content-Type: application/json

{ "name": "Ventana corrediza", "description": "Aluminio natural", "basePrice": "450000" }
```
Respuesta `201`:
```json
{ "id": "…", "name": "Ventana corrediza", "description": "Aluminio natural", "basePrice": "450000.00", "isActive": true }
```

### Productos activos para cotizar
```http
GET /api/v1/products/search?search=ventana&filters=[{"field":"isActive","operator":"equals","value":true}]&sortBy=name&sortDir=asc
```
Respuesta `200`: `{ "data": [ … ], "total": 1, "page": 1, "limit": 20 }`.

Errores: `400 VALIDATION_FAILED`, `400 PRODUCT_PRICE_REQUIRED`, `400 INVALID_PRODUCT_FORMULA`,
`400 INVALID_FILTER_VALUE`, `403 INSUFFICIENT_PERMISSIONS`, `404 PRODUCT_NOT_FOUND` (también si es de otra empresa).
