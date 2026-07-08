import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { env } from './env.js'

const { Pool } = pg

const pool = new Pool({
  connectionString: env.DATABASE_URL,
})

const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
})

export default prisma