import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

const app: Express = express();

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

export default app;