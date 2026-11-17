# Contactos y empresas cliente

## Propósito
La cartera de clientes de la empresa: personas (contactos) y empresas cliente, cada una con su comercial responsable. Es la base de las cotizaciones (F3) y de la cartera de Siigo (F6).

## Reglas de negocio
- **Responsable** (`ownerId`, D-18): un `SALES_REP` solo lista, filtra y modifica los clientes de los que es responsable. Lo que crea queda a su nombre aunque envíe otro `ownerId`, y solo puede vincular un contacto a una empresa cliente suya. Gestión (`OWNER`, `PARTNER`, `SALES_LEADER`) ve todos y asigna el responsable a un usuario activo de la empresa (si no, 400 `OWNER_NOT_FOUND`).
- Los clientes creados antes de F1-T17 no tienen responsable: solo los ve gestión hasta que los asigne (Q-005).
- **Documento** (D-19): un contacto puede tener `documentType` (`CC`, `CE`, `TI`, `PASSPORT`, `PPT`, `NIT`) y `documentNumber`; una empresa cliente, su NIT en `taxNumber`. Se guardan normalizados: solo dígitos (letras y dígitos en mayúscula en pasaportes) y el NIT sin dígito de verificación. Así `1.020.304.050` y `1020304050` son el mismo documento.
- Un documento repetido entre los clientes activos de la empresa responde 409 `DOCUMENT_ALREADY_REGISTERED`. El de un cliente borrado se puede volver a usar. Un número sin tipo responde 400 `DOCUMENT_TYPE_REQUIRED`.
- El `companyId` de un contacto tiene que ser una empresa cliente de la misma empresa, no borrada (H9): si no, 400 `INVALID_COMPANY_CONTACT`.
- **Borrado suave**: solo gestión. Una empresa cliente con contactos activos no se borra (409 `COMPANY_CONTACT_HAS_CONTACTS`, Q-012). Un cliente borrado deja de verse y no se puede modificar (404).

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/contacts` | Todos (comercial: los suyos) | Contactos visibles |
| GET | `/api/v1/contacts/search` | Todos (comercial: los suyos) | Listado filtrado y paginado ([filtrado](filtrado.md)) |
| POST | `/api/v1/contacts` | Todos | Crea un contacto |
| PATCH | `/api/v1/contacts/:id` | Todos (comercial: los suyos) | Modifica un contacto |
| DELETE | `/api/v1/contacts/:id` | Gestión | Borrado suave |
| GET | `/api/v1/company-contacts` | Todos (comercial: las suyas) | Empresas cliente visibles |
| GET | `/api/v1/company-contacts/search` | Todos (comercial: las suyas) | Listado filtrado y paginado |
| POST | `/api/v1/company-contacts` | Todos | Crea una empresa cliente |
| PATCH | `/api/v1/company-contacts/:id` | Todos (comercial: las suyas) | Modifica una empresa cliente |
| DELETE | `/api/v1/company-contacts/:id` | Gestión | Borrado suave, sin contactos activos |

## Ejemplos
### Crear un contacto
Petición:
```http
POST /api/v1/contacts
Content-Type: application/json

{
  "firstName": "Laura",
  "lastName": "Martínez",
  "email": "laura.martinez@example.com",
  "documentType": "CC",
  "documentNumber": "1.020.304.050",
  "companyId": "id-de-la-empresa-cliente"
}
```
Respuesta `201`:
```json
{
  "id": "3c4d…",
  "firstName": "Laura",
  "lastName": "Martínez",
  "email": "laura.martinez@example.com",
  "companyId": "id-de-la-empresa-cliente",
  "ownerId": "id-de-quien-lo-creó",
  "documentType": "CC",
  "documentNumber": "1020304050"
}
```
Errores: `400 VALIDATION_FAILED`, `400 INVALID_COMPANY_CONTACT`, `400 OWNER_NOT_FOUND`, `400 DOCUMENT_TYPE_REQUIRED`, `400 INVALID_DOCUMENT_NUMBER`, `409 DOCUMENT_ALREADY_REGISTERED`.

### Crear una empresa cliente
Petición:
```http
POST /api/v1/company-contacts
Content-Type: application/json

{ "name": "Constructora El Roble SAS", "taxNumber": "900.123.456-7", "city": "Medellín" }
```
Respuesta `201`: la empresa con `documentNumber: "900123456"` y `ownerId` del usuario que la creó.

## Seguridad
- Acotado al tenant de la sesión y, para los comerciales, a sus clientes. Un cliente de otra empresa responde 404.
- La unicidad del documento la comprueba la aplicación y la garantiza un índice único parcial de la base (F2-T09): de dos altas simultáneas con el mismo documento, una recibe 409 `DOCUMENT_ALREADY_REGISTERED`.
- Se auditan creación, modificación (nombres de campos, nunca valores) y borrado.
