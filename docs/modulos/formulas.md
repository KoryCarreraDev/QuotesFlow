# Fórmulas de precio

> F3-T03 (evaluador) y F3-T04 (CRUD).

## Propósito
Cada empresa define cómo se calcula el precio de sus productos con una fórmula y unas variables que el comercial
llena al cotizar (por ejemplo, `ancho * alto * precioM2`).

## Evaluador (`IFormulaEvaluator`, adaptador `MathjsFormulaEvaluator`)
Una fórmula la escribe el dueño de cada empresa y la API la ejecuta: se trata como código ajeno.

- Nunca se llama a `evaluate` sobre el texto. Se analiza, se recorre el árbol con una **lista blanca** y solo
  entonces se calcula. Al evaluar se vuelve a aplicar la lista blanca, también a fórmulas ya guardadas.
- Permitido:
  - números de hasta 15 cifras enteras y 6 decimales;
  - las variables declaradas;
  - `+`, `-`, `*`, `/`, el menos unario y paréntesis;
  - la multiplicación implícita (`2ancho`);
  - las funciones `min`, `max`, `round`, `ceil`, `floor` y `abs`.
- Rechazado con `400 INVALID_FORMULA`:
  - cualquier otra función, incluidas `import`, `createUnit`, `evaluate`, `parse`, `simplify`, `derivative` y `compile`;
  - accesos a propiedades o índices, asignaciones, definiciones de función y varias expresiones (`;`);
  - condicionales, comparaciones, operadores lógicos, matrices, objetos y rangos;
  - potencia (`^`), factorial (`!`) y módulo: con ellos una fórmula corta produce números de millones de cifras;
  - unidades, constantes de mathjs (`pi`, `e`), `Infinity`, `NaN`, texto entre comillas y variables no declaradas;
  - fórmulas vacías, de más de 500 caracteres o de más de 100 nodos.
- Defensa en profundidad: en la instancia de mathjs esas funciones peligrosas están además deshabilitadas.
- Variables: nombre de letras, números y `_`, que empieza por letra o `_`, hasta 40 caracteres y distinto de las
  funciones permitidas (`400 INVALID_FORMULA_VARIABLE`). Su valor llega como texto decimal no negativo, con hasta
  15 cifras enteras y 6 decimales; si falta o no tiene ese formato, `400 INVALID_FORMULA_VARIABLE`.
- Cálculo con BigNumber (64 cifras de precisión): `0.1 + 0.2` da `0.3` exacto. El resultado sale como texto sin
  redondear; `Money.fromDecimalStringRounded` lo deja en centavos (`docs/modulos/dinero.md`).
- División por cero, un resultado que no es un número finito o uno de 15 cifras enteras o más:
  `400 FORMULA_EVALUATION_FAILED`.

## Ejemplos
| Fórmula | Variables | Resultado |
|---|---|---|
| `ancho * alto * precioM2` | ancho `1.20`, alto `1.50`, precioM2 `180000` | `324000` |
| `ceil(ancho / 0.5)` | ancho `1.2` | `3` |
| `round(ancho / 3, 2)` | ancho `10` | `3.33` |
| `ancho.constructor` | — | `400 INVALID_FORMULA` |
| `ancho / alto` | alto `0` | `400 FORMULA_EVALUATION_FAILED` |

Tests de inyección: `tests/unit/infrastructure/MathjsFormulaEvaluator.test.ts`.

## Gestión de fórmulas (F3-T04)
- Una fórmula tiene nombre, expresión y variables (`{ name, label }`, como mucho 20, sin repetir). `name` es lo que
  aparece en la expresión; `label`, lo que ve el comercial al cotizar.
- Al crear y al modificar, la expresión se valida con el evaluador contra las variables que quedan: quitar una
  variable que la expresión usa responde `400 INVALID_FORMULA`.
- Modificar una fórmula no cambia las cotizaciones ya hechas: guardan el precio calculado (F3-T05).
- No se borra una fórmula que usa algún producto no borrado: `409 FORMULA_IN_USE`.
- Permisos: todo el equipo las consulta (el comercial necesita ver las variables); dueño, socio y líder las crean,
  modifican y borran. **Supuesto pendiente de confirmar por el dueño de producto**, igual que en productos.
- Toda modificación se audita en la misma transacción (`FORMULA_CREATED`, `FORMULA_UPDATED` con los campos
  cambiados, `FORMULA_DELETED`).

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | `/api/v1/formulas/search` | Todos | Busca, filtra, ordena y pagina (`id`, `name`✔, `createdAt`) |
| POST | `/api/v1/formulas` | Gestión | `{ name, expression, variables: [{ name, label }] }` → 201 |
| PATCH | `/api/v1/formulas/:id` | Gestión | Modificación parcial; vuelve a validar la expresión |
| DELETE | `/api/v1/formulas/:id` | Gestión | Borrado suave; `409 FORMULA_IN_USE` si un producto la usa |

### Ejemplo
```http
POST /api/v1/formulas
Content-Type: application/json

{
  "name": "Ventana por metro cuadrado",
  "expression": "ceil(ancho * alto * precioM2)",
  "variables": [
    { "name": "ancho", "label": "Ancho (m)" },
    { "name": "alto", "label": "Alto (m)" },
    { "name": "precioM2", "label": "Precio por m²" }
  ]
}
```
Errores: `400 VALIDATION_FAILED`, `400 INVALID_FORMULA`, `400 INVALID_FORMULA_VARIABLE`,
`403 INSUFFICIENT_PERMISSIONS`, `404 FORMULA_NOT_FOUND`, `409 FORMULA_IN_USE`.
