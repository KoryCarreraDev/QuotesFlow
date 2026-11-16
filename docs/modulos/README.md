# Módulos

Un archivo por módulo funcional: `docs/modulos/<modulo>.md` (regla R12 de `PLAN.md`). Se entrega en el mismo PR que el módulo; sin documentación no hay merge.

Los módulos existentes (auth, leads, estados, contactos y filtrado) se documentan en la tarea F1-T18.

## Plantilla

````markdown
# <Módulo>

## Propósito
Qué problema resuelve y para quién.

## Reglas de negocio
- Reglas por rol, validaciones, estados, casos límite.

## Endpoints
| Método | Ruta | Roles | Descripción |
|---|---|---|---|

## Ejemplos
### <Endpoint>
Petición:
```http
POST /api/v1/<recurso>
Content-Type: application/json

{ ... }
```
Respuesta `201`:
```json
{ ... }
```
Errores: código HTTP y código de error estable en inglés (Q-003).

## Seguridad
Aislamiento por tenant, permisos, datos sensibles, límites de tasa.
````
