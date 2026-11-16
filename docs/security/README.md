# Seguridad

Documentos de seguridad vivos, que se mantienen al día con el código.

| Archivo | Contenido | Tarea | Firma |
|---|---|---|---|
| `matriz-permisos.md` | Qué rol puede hacer qué acción sobre qué recurso. Se genera desde las políticas de `application/policies` | F1-T04 | Responsable de seguridad |

Reglas que aplican a todo lo que se documenta aquí:

- R5: toda consulta filtra por `tenantId` y `deleted`; todo endpoint entra en las matrices de aislamiento y de roles (`tests/api/security/`).
- R8: entrada validada con Zod, salida por DTO, dinero con decimales exactos, SQL crudo solo parametrizado, secretos solo por variables de entorno.

Nunca se escriben aquí secretos, credenciales ni datos reales de clientes.
