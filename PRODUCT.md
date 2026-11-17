# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Frontend: React + Vite (SPA), en un repositorio aparte (confirmado el 2026-11-16). Consume la API REST `/api/v1` de este repositorio con sesión por cookie HTTP-only. Frontend y API se sirven bajo el mismo dominio (`app.` y `api.`, D-14). El stack del backend está en `CONTEXT.md`, sección 3.

## Users

**Principal: el comercial en oficina.** Trabaja frente al computador varias horas al día: registra y sigue leads, mantiene sus clientes, arma cotizaciones y las envía. Solo ve los leads y clientes de los que es responsable.

Empresas destino: cualquier pyme B2B colombiana con equipo comercial que cotiza. No hay un sector concreto.

Otros usuarios, confirmados en `PLAN.md`:

- **Gestión** (dueño `OWNER`, socio `PARTNER`, líder comercial `SALES_LEADER`): ve todo el equipo, asigna responsables, configura estados de lead, descuentos y mora, y consulta cartera y analíticas.
- **Administrador de plataforma** (`SUPER_ADMIN`, `SUPPORT` de solo lectura): identidad separada de las empresas, con 2FA obligatorio. Activa suscripciones a mano, revisa logs y ejecuta mantenimiento. Es una superficie distinta de la aplicación de las empresas.

## Product Purpose

QuotesUp es un SaaS multi-tenant de gestión comercial: cada empresa lleva en un solo lugar sus leads, clientes, cotizaciones, cartera y analíticas de venta. Existe para que una pyme no reparta su proceso comercial entre un CRM, un cotizador, hojas de cálculo y su sistema contable.

Éxito: el comercial lleva un lead hasta una cotización enviada y sabe qué le deben sus clientes sin salir del producto; gestión ve el estado real del equipo sin pedir reportes.

## Positioning

Ciclo comercial completo en un solo producto, hecho para Colombia: lead → cotización (PDF y correo) → cartera sincronizada con Siigo → analíticas. Maneja pesos colombianos, IVA, NIT y tipos de documento locales desde el diseño, y cada factura de cartera queda a nombre del comercial responsable del cliente.

## Operating Context

- Uso de escritorio, en horario laboral, como herramienta de trabajo diaria.
- Una oficina completa puede salir por la misma IP pública y comparte el límite de peticiones de la API (100 cada 15 minutos por IP, configurable).
- Documentos que salen del producto hacia el cliente final: cotización en PDF con logo y datos de la empresa, y correos. Siempre en español.
- Sistemas alrededor: Siigo (facturas y saldos; cada empresa conecta su propia cuenta), correo transaccional con Resend.
- Descargas: cartera en Excel; reportes en CSV o XLSX.

## Capabilities and Constraints

El estado exacto de cada módulo vive en `CONTEXT.md` (hecho) y `PLAN.md` (planeado). Antes de diseñar una pantalla, comprobar ahí que su API existe.

**Disponible hoy en la API** (contrato en `docs/openapi.json`): registro de empresa y login; leads con cambio de estado (el historial se guarda, pero aún no hay endpoint para leerlo); estados de lead configurables por empresa (nombre, color, orden, tipo abierto/ganado/perdido); contactos y empresas cliente con responsable y documento; listados con búsqueda, filtros, orden y paginación (20 por página por defecto, máximo 100).

**Planeado, sin API todavía:** sesiones con refresh, verificación de correo, recuperación de contraseña e invitación de usuarios (F2); productos con precio fijo o por fórmula, cotizaciones, PDF y envío por correo (F3); notificaciones y alertas (F4); suscripciones y panel de administración (F5); Siigo y cartera con mora (F6); analíticas (F7).

**Restricciones que la interfaz debe respetar:**

- Permisos por rol según `docs/security/matriz-permisos.md`. El comercial solo ve y modifica lo suyo; un recurso fuera de su alcance responde 404.
- La API devuelve errores como `{ error: { code, message, details? } }` con mensaje técnico en inglés. El frontend traduce cada `code` a un texto en español para el usuario (Q-003).
- Todo el contenido que lee el usuario o el cliente final va en español (R11).
- Solo pesos colombianos en el MVP (D-21). IVA por ítem, 19 % por defecto y configurable al cotizar (D-20).
- Precios, totales y permisos los calcula el servidor; la interfaz los muestra, no los recalcula.
- Una cotización enviada no se edita: los cambios generan una versión nueva (D-22). Pasa a vencida sola al cumplirse su vigencia (D-23).
- El comercial puede cambiar a mano un precio calculado, y eso alerta al líder comercial (D-24). Descuento máximo por rol (D-25).
- Borrado suave en todo: lo borrado desaparece de los listados y se purga a los 60 días (D-39).
- Notificaciones in-app por consulta periódica, sin tiempo real en el MVP (D-29).
- Suscripción: la prueba gratuita se solicita dejando datos y motivo (D-31); activación manual por un administrador, sin pasarela de pago (D-32); al vencer, un mes de solo lectura y exportación con avisos, y después sin acceso (D-33).
- Fuera del MVP: enlace público de cotización, 2FA para usuarios de empresa, etiquetas, campos personalizados, metas, búsqueda global, plantillas por empresa, WhatsApp y calendario (C-07 a C-15, D-13).

**Terminología:** lead; estado de lead; contacto (persona); empresa cliente; responsable (comercial dueño de un lead o cliente); gestión (dueño, socio y líder comercial); cotización; cartera; mora; "empresa" para lo que el código llama tenant.

**Sin decidir:** hosting del backend (D-55); planes, límites y precios (`PLAN.md`, sección 8); términos y política de datos (D-56, Ley 1581); estándar de accesibilidad.

## Brand Commitments

- Nombre comercial: **QuotesUp** (confirmado el 2026-11-16). El repositorio, el paquete y las imágenes Docker aún dicen QuotesFlow o `saas-comerciales-backend`.
- No se ha verificado la disponibilidad de QuotesUp como marca (SIC), dominio ni usuario en redes. El estudio de `Claude outputs/Nombres para SaaS de cotizaciones.md` evaluó otros candidatos, no este.
- No existen logo, voz de marca ni identidad visual definidos.

## Evidence on Hand

- `docs/openapi.json`: contrato OpenAPI 3.1 de la API, generado desde el código.
- `docs/security/matriz-permisos.md`: qué puede hacer cada rol.
- `docs/modulos/`: reglas de negocio y ejemplos de petición y respuesta de auth, leads, estados de lead, contactos y filtrado.
- `src/application/constants/defaultLeadStatuses.ts`: los cinco estados con los que arranca cada empresa (Nuevo, Contactado, Calificado, Ganado, Perdido).

No existen y no deben inventarse: clientes, testimonios, casos de éxito, cifras de uso, precios, capturas de pantalla, logo ni prensa.

## Product Principles

1. **El comercial primero.** Cada pantalla se resuelve antes para quien trabaja leads y cotizaciones todo el día en un escritorio; las vistas de gestión se apoyan en ese mismo trabajo.
2. **Un solo hilo del lead a la cartera.** El lead, su cotización y la deuda del cliente son la misma historia; el producto no obliga a saltar de herramienta ni a volver a digitar.
3. **Cada quien ve lo suyo.** El alcance por rol es parte del producto, no un filtro opcional: la interfaz no insinúa datos que el usuario no puede ver.
4. **Colombia por defecto.** Pesos, IVA, NIT, Siigo y español son el punto de partida, no una configuración.
5. **El servidor tiene la última palabra.** Precios, totales, permisos y estados se muestran tal como los entrega la API.
