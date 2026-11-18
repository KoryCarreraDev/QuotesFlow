# Dinero exacto

> F3-T01. Resuelve H21 y aplica R8: el dinero nunca pasa por `number`.

## Propósito
Importes en pesos colombianos (D-21) y porcentajes (IVA, descuentos) sin errores de redondeo. Lo usan los leads
(`estimatedValue`) y lo usarán productos, fórmulas y cotizaciones.

## Reglas de negocio
- `Money` (`src/domain/value-objects/money.ts`) guarda centavos en un `bigint`. Hasta 15 cifras enteras y 2 decimales.
- `Percentage` guarda puntos básicos (centésimas de punto): 19 % son 1900. De 0 a 100, con hasta 2 decimales.
- Redondeo: mitad hacia arriba, alejándose del cero (0,005 → 0,01; -0,005 → -0,01).
- Porcentaje de un importe: `importe × tasa`, redondeado a centavos al final (19 % de 100,05 = 19,01).
- Un resultado calculado con más decimales (fórmulas) se redondea con `Money.fromDecimalStringRounded`; lo que
  escribe una persona se lee exacto con `Money.fromDecimalString` y más de dos decimales es un error.
- Sin librerías: el dominio no puede importarlas (R4). Las fórmulas (F3-T03) calculan con el BigNumber de `mathjs`
  en infraestructura y entregan el resultado como texto.

## Formato en la API
Importes y porcentajes viajan como **texto decimal**, nunca como number:

```json
{ "estimatedValue": "2500000.50" }
```

- Entrada: sin signo, sin separadores de miles, con punto decimal y hasta 2 decimales (`"2500000"`, `"99.9"`).
- Salida: siempre con 2 decimales (`"2500000.00"`).
- Errores: `400 VALIDATION_FAILED` en el borde (number, negativo, coma decimal, más de 2 decimales). Dentro del
  dominio, `INVALID_MONEY_AMOUNT`, `INVALID_PERCENTAGE` e `INVALID_QUANTITY`.

## Base de datos
Columnas `Decimal` de PostgreSQL. Se escriben con `toDecimalString()` y se leen con el `toFixed()` del `Decimal` de
Prisma, que no usa notación científica.

## Pendiente
- Los filtros de búsqueda sobre `estimatedValue` (`gte`, `lt`…) siguen recibiendo un number: solo comparan, no
  guardan ni suman, y un importe con céntimos se compara bien hasta 15 cifras.
