import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { authRouter } from './presentation/routes/authRoutes.js';
import { ScopedContainer } from './cross-cutting/container.js';

const app: Express = express();
const publicContainer = new ScopedContainer();

// Seguridad
app.use(helmet());
app.use(cors());

// Compresión
app.use(compression());

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));

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

export default app;