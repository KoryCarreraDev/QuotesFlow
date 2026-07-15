import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { authRouter } from './presentation/routes/authRoutes.js';
import { ScopedContainer } from './cross-cutting/container.js';
import { leadRouter } from './presentation/routes/leadRoutes.js';
import { JwTokenService } from './infrastructure/services/JwtTokenService.js';
import { IAuthTokenService } from "./application/ports/services/IAuthTokenService.js";

const jwtService: IAuthTokenService = new JwTokenService();
const app: Express = express();
const publicContainer = new ScopedContainer();

// Seguridad
app.use(helmet());
app.use(cors());

// Compresión
app.use(compression());

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
// Parseo de Cookies
app.use(cookieParser());

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter(publicContainer));
app.use('/api/lead', leadRouter(jwtService));

export default app;