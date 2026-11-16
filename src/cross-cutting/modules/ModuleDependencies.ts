import { PrismaClient } from '@prisma/client';
import { ITenantContext } from '../../application/ports/services/ITenantContext.js';

/** Lo que comparten todos los módulos del contenedor dentro de una misma petición. */
export interface ModuleDependencies {
  prisma: PrismaClient;
  tenantContext: ITenantContext;
}
