import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

// H25: antes, en desarrollo Prisma escribía cada consulta con sus parámetros (datos de clientes).
// Ahora las consultas solo se emiten como evento en desarrollo y `PrismaService` registra el texto
// de la consulta y su duración, nunca los parámetros.
const prisma = new PrismaClient({
  adapter,
  log:
    env.NODE_ENV === 'development'
      ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
      : [
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ],
});

export default prisma;
