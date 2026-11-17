import express, { Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { authRouter } from './presentation/routes/authRoutes.js';
import { ScopedContainer } from './cross-cutting/container.js';
import { leadRouter } from './presentation/routes/leadRoutes.js';
import { contactRouter } from './presentation/routes/contactRoutes.js';
import { companyContactRouter } from './presentation/routes/companyContactRoutes.js';
import { leadStatusConfigRouter } from './presentation/routes/leadStatusConfigRouter.js';
import { userRouter } from './presentation/routes/userRoutes.js';
import { tenantRouter } from './presentation/routes/tenantRoutes.js';
import { createErrorHandler, createRouteNotFoundHandler } from './infrastructure/web/middleware/errorHandler.js';
import {
  createCorsMiddleware,
  createOriginCheckMiddleware,
  createRateLimiter,
} from './infrastructure/web/httpSecurity.js';
import { env } from './config/env.js';
import { createLivenessHandler, createReadinessHandler } from './presentation/routes/healthRoutes.js';
import { isDatabaseReachable } from './infrastructure/persistence/prisma/databaseReadiness.js';
import { PrismaService } from './infrastructure/persistence/prisma/PrismaService.js';
import { appLogger } from './infrastructure/logging/appLogger.js';
import {
  createAccessLogMiddleware,
  createRequestContextMiddleware,
} from './infrastructure/web/middleware/requestLogging.js';

const RATE_LIMIT_WINDOW_MINUTES = 15;
const MILLISECONDS_PER_MINUTE = 60_000;
const RATE_LIMIT_WINDOW_MS = RATE_LIMIT_WINDOW_MINUTES * MILLISECONDS_PER_MINUTE;
// Ningún cuerpo legítimo de la API se acerca a esto; uno mayor solo sirve para agotar memoria (H14).
const JSON_BODY_LIMIT = '100kb';

const app: Express = express();
const publicContainer = new ScopedContainer();
// F2-T02: toda ruta protegida comprueba en la base que la sesión sigue abierta y lee el rol actual (H2).
const authenticateSession = publicContainer.auth.getAuthenticateSessionUseCase();

// Seguridad
// Sin proxy de confianza (0), X-Forwarded-For se ignora: nadie falsifica su IP ante el limitador (H6).
app.set('trust proxy', env.TRUST_PROXY);
// Primero: todo lo que sigue (logs, auditoría, errores) ve el id de la petición (F1-T07).
app.use(createRequestContextMiddleware());
app.use(createAccessLogMiddleware(appLogger));
app.use(helmet());
app.use(createCorsMiddleware(env.CORS_ALLOWED_ORIGINS));
// CSRF (F2-T07): el mismo origen que CORS autoriza es el único que puede modificar datos con la cookie.
app.use(createOriginCheckMiddleware(env.CORS_ALLOWED_ORIGINS));

// Compresión
app.use(compression());

// Parseo de JSON
app.use(express.json({ limit: JSON_BODY_LIMIT }));
// Parseo de Cookies
app.use(cookieParser());

// Sondas de vida y de disponibilidad (F1-T08). Van antes del limitador global (F2-T10, F1-S5): el
// orquestador sondea cada pocos segundos desde la misma IP y un 429 lo haría reiniciar una instancia sana.
// No abren la puerta a un abuso: `/health` no hace trabajo y `/ready` es un `SELECT 1` con plazo.
const prismaClient = PrismaService.getInstance().client;
app.get('/health', createLivenessHandler());
app.get(
  '/ready',
  createReadinessHandler(() => isDatabaseReachable(prismaClient, appLogger)),
);

// Límites de tasa por IP: uno global y otro, más bajo, para login y registro (H6).
app.use(createRateLimiter({ maxRequests: env.RATE_LIMIT_GLOBAL_MAX_REQUESTS, windowMs: RATE_LIMIT_WINDOW_MS }));
const authRateLimiter = createRateLimiter({
  maxRequests: env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

// API REST versionada (D-06, F1-T11). Las sondas /health y /ready quedan fuera: son del orquestador.
const API_BASE_PATH = '/api/v1';
app.use(`${API_BASE_PATH}/auth`, authRouter(publicContainer, authenticateSession, authRateLimiter));
app.use(`${API_BASE_PATH}/leads`, leadRouter(authenticateSession));
app.use(`${API_BASE_PATH}/contacts`, contactRouter(authenticateSession));
app.use(`${API_BASE_PATH}/company-contacts`, companyContactRouter(authenticateSession));
app.use(`${API_BASE_PATH}/lead-statuses`, leadStatusConfigRouter(authenticateSession));
app.use(`${API_BASE_PATH}/users`, userRouter(authenticateSession));
app.use(`${API_BASE_PATH}/tenant`, tenantRouter(authenticateSession));

// Errores: siempre al final, después de todas las rutas (H5).
app.use(createRouteNotFoundHandler());
app.use(createErrorHandler(appLogger));

export default app;
