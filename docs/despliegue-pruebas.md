# Entorno de pruebas: frontend en Vercel y API por ngrok

> F3-T11, D-58. Provisional hasta comprar el dominio: entonces se pasa a `app.` y `api.` del mismo dominio (D-14).

## Cómo encaja

```
Navegador ──► https://<proyecto>.vercel.app            (frontend, Vercel gratis)
                 │  /api/*  (rewrite de Vercel, mismo origen para el navegador)
                 ▼
              https://crepe-waviness-ploy.ngrok-free.dev  (túnel de ngrok)
                 ▼
              API en el equipo local (puerto 4000) ──► PostgreSQL local
```

El frontend **no** llama a la URL de ngrok directamente: llama a `/api/v1/...` en su propio dominio y Vercel
reenvía la petición a ngrok. Motivo:

- Las cookies de sesión son `SameSite=Strict` (D-14). `vercel.app` y `ngrok-free.dev` son sitios distintos:
  si el frontend llamara a ngrok directamente, el navegador no enviaría las cookies y nadie podría iniciar sesión.
- Relajarlas a `SameSite=None` tampoco basta: Safari (iPhone y Mac) bloquea siempre las cookies de otro sitio.
- Con el reenvío, para el navegador todo es del mismo origen: las cookies funcionan en todos los navegadores
  sin tocar la seguridad de la API.

## Frontend (Vercel)

`vercel.json` en la raíz del proyecto del frontend:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://crepe-waviness-ploy.ngrok-free.dev/api/:path*" }
  ]
}
```

Con Next.js, lo mismo en `next.config` (`rewrites`). En el código del frontend:

- Rutas relativas: `fetch('/api/v1/auth/login', ...)`, nunca la URL de ngrok.
- Cabecera `ngrok-skip-browser-warning: true` en todas las peticiones. Sin ella, ngrok responde con su página
  de aviso en lugar de la API. La API la acepta (test en `tests/api/security/hardening.test.ts`).
- El contrato está en `docs/openapi.json`. Los errores se muestran según `error.code`, no según el texto.
- Renovar la sesión (`POST /api/v1/auth/refresh`) de una en una: dos renovaciones a la vez con el mismo
  refresh token cierran la sesión (F2-S1).

## API (equipo local)

Variables en `.env` además de las habituales (`.env.example`):

```bash
NODE_ENV=development
# El origen del frontend tal como lo ve el navegador (el reenvío conserva la cabecera Origin).
CORS_ALLOWED_ORIGINS="https://<proyecto>.vercel.app"
# Enlaces de los correos (verificación, invitación, recuperación).
APP_BASE_URL="https://<proyecto>.vercel.app"
# Delante de la API hay dos proxies: Vercel y ngrok. Con 2, el límite por IP usa la IP real de cada
# usuario; con 0 o 1, todos compartirían la IP de Vercel y agotarían el cupo entre todos.
TRUST_PROXY=2
# Mientras no haya dominio verificado en Resend, los correos se escriben en el log de la API.
EMAIL_PROVIDER=log
```

Arranque:

```bash
pnpm prisma migrate deploy        # aplica las migraciones pendientes, sin borrar datos
pnpm dev                          # API en el puerto 4000
ngrok http --url=crepe-waviness-ploy.ngrok-free.dev 4000
```

## Correos mientras no hay dominio

- Con `EMAIL_PROVIDER=log`, cada correo de la cuenta (verificación, invitación, recuperación) aparece en el log
  de la API con su enlace. Quien opera el entorno lo copia y lo envía al usuario por otro medio.
- Los correos de negocio (enviar cotizaciones, alertas) dependen además del ajuste de cada empresa
  `emailDeliveryEnabled` (D-57, F3-T10), desactivado por defecto: sin correo, las alertas quedan dentro de la
  aplicación y la cotización se comparte descargando el PDF.
- Cuando el dominio esté verificado en Resend (SPF, DKIM, DMARC): `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` y
  `EMAIL_FROM` con una dirección del dominio. No hace falta cambiar código.

## Cerrar el acceso directo a ngrok (F3-A23)

La URL de ngrok es pública y está en el repositorio. Mientras cualquiera pueda llamarla sin pasar por Vercel, puede
falsear `X-Forwarded-For` (salta el límite por IP) y hablar con una API en modo desarrollo. Para cerrarlo, que ngrok
solo deje pasar lo que trae un secreto compartido con Vercel:

1. **Secreto**: genera uno largo y aleatorio (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   Vive solo en las variables de entorno de Vercel y en la configuración de ngrok del equipo local; **nunca en el
   repositorio**, ni en `vercel.json`, ni en este archivo. Cámbialo si alguna vez se pega en un chat o un log.
2. **ngrok**: una política de tráfico (`--traffic-policy-file`) que rechace con 403 toda petición que no traiga la
   cabecera `x-proxy-secret` con ese valor. La sintaxis de las políticas de tráfico cambia entre versiones: toma la
   forma exacta de la documentación vigente de ngrok y pruébala con `curl` sin la cabecera (debe dar 403) y con ella.
3. **Vercel**: el reenvío (`rewrites`) debe añadir la cabecera. `vercel.json` no pone cabeceras a una petición
   reenviada a un destino externo; se hace con una función o middleware de Vercel que reenvía la petición con la
   cabecera. Comprueba en la documentación vigente de Vercel cuál de las dos opciones aplica a tu proyecto.
4. Comprueba de punta a punta: la app en Vercel funciona y `curl https://<ngrok>/health` sin la cabecera da 403.

Además, indica en el entorno de pruebas:

- **Datos de prueba solamente**, cuentas de prueba y un `JWT_SECRET` distinto del de producción.
- No cambies `NODE_ENV` a `production` para "endurecerlo": en producción `EMAIL_PROVIDER=log` no está permitido y
  `FILE_STORAGE_DIRECTORY` es obligatoria. Es una decisión de quien opera el entorno.

## Limitaciones conocidas

- La API solo responde mientras el equipo local y ngrok estén encendidos.
- El plan gratuito de ngrok limita peticiones y ancho de banda.
- Con `TRUST_PROXY=2`, quien llame a ngrok directamente (sin pasar por Vercel) puede falsear su IP en
  `X-Forwarded-For` y saltarse el límite por IP, salvo que se aplique la sección anterior. El bloqueo por cuenta (F2-T03) sigue funcionando. Aceptable
  solo en este entorno de pruebas, con datos de prueba.
- Solo datos de prueba: el entorno no tiene copias de seguridad ni la auditoría de F2 firmada.
