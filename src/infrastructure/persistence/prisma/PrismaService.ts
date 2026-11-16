import { PrismaClient } from '@prisma/client';
import prisma from '../../../config/database.js';
import { appLogger } from '../../logging/appLogger.js';

interface QueryEvent {
  query: string;
  duration: number;
}

export class PrismaService {
  private static instance: PrismaService;
  readonly client: PrismaClient;

  private constructor() {
    this.client = prisma;
    // Solo llega en desarrollo (ver config/database.ts). Se registra el SQL con marcadores ($1, $2…):
    // los parámetros, que pueden ser datos de clientes, nunca se escriben (H25).
    (this.client as unknown as { $on(event: 'query', listener: (queryEvent: QueryEvent) => void): void }).$on(
      'query',
      (queryEvent) => appLogger.debug('Database query', { query: queryEvent.query, durationMs: queryEvent.duration }),
    );
  }

  static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService();
    }
    return PrismaService.instance;
  }
}
