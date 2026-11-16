import express, { Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { authRouter } from './presentation/routes/authRoutes.js';
import { ScopedContainer } from './cross-cutting/container.js';
import { leadRouter } from './presentation/routes/leadRoutes.js';
import { contactRouter } from './presentation/routes/contactRoutes.js';
import { companyContactRouter } from './presentation/routes/companyContactRoutes.js';
import { JwTokenService } from './infrastructure/services/JwtTokenService.js';
import { IAuthTokenService } from './application/ports/services/IAuthTokenService.js';
import { leadStatusConfigRouter } from './presentation/routes/leadStatusConfigRouter.js';
import { createErrorHandler, createRouteNotFoundHandler } from './infrastructure/web/middleware/errorHandler.js';
import { createCorsMiddleware, createRateLimiter } from './infrastructure/web/httpSecurity.js';
import { env } from './config/env.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
// Ningún cuerpo legítimo de la API se acerca a esto; uno mayor solo sirve para agotar memoria (H14).
const JSON_BODY_LIMIT = '100kb';

const jwtService: IAuthTokenService = new JwTokenService();
const app: Express = express();
const publicContainer = new ScopedContainer();

// Seguridad
// Sin proxy de confianza (0), X-Forwarded-For se ignora: nadie falsifica su IP ante el limitador (H6).
app.set('trust proxy', env.TRUST_PROXY);
app.use(helmet());
app.use(createCorsMiddleware(env.CORS_ALLOWED_ORIGINS));

// Compresión
app.use(compression());

// Parseo de JSON
app.use(express.json({ limit: JSON_BODY_LIMIT }));
// Parseo de Cookies
app.use(cookieParser());

// Límites de tasa por IP: uno global y otro, más bajo, para login y registro (H6).
app.use(createRateLimiter({ maxRequests: env.RATE_LIMIT_GLOBAL_MAX_REQUESTS, windowMs: RATE_LIMIT_WINDOW_MS }));
const authRateLimiter = createRateLimiter({
  maxRequests: env.RATE_LIMIT_AUTH_MAX_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
});

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRateLimiter, authRouter(publicContainer));
app.use('/api/lead', leadRouter(jwtService));
app.use('/api/contact', contactRouter(jwtService));
app.use('/api/companyContact', companyContactRouter(jwtService));
app.use('/api/leadStatusConfig', leadStatusConfigRouter(jwtService));

// Errores: siempre al final, después de todas las rutas (H5).
app.use(createRouteNotFoundHandler());
app.use(createErrorHandler());

export default app;
