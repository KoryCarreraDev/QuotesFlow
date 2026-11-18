import { ITenantContext } from '../application/ports/services/ITenantContext.js';
import { PrismaService } from '../infrastructure/persistence/prisma/PrismaService.js';
import { AuthModule } from './modules/AuthModule.js';
import { CompanyContactModule } from './modules/CompanyContactModule.js';
import { ContactModule } from './modules/ContactModule.js';
import { EmailModule } from './modules/EmailModule.js';
import { UserModule } from './modules/UserModule.js';
import { TenantModule } from './modules/TenantModule.js';
import { ProductModule } from './modules/ProductModule.js';
import { LeadModule } from './modules/LeadModule.js';
import { LeadStatusModule } from './modules/LeadStatusModule.js';
import { ModuleDependencies } from './modules/ModuleDependencies.js';
import { TenantContext } from './tenantContext.js';

// Sin tenant (rutas públicas), cualquier repositorio que lo pida falla en lugar de consultar sin filtro.
const tenantlessContext: ITenantContext = {
  getTenantId: () => {
    throw new Error('Tenant context not available in this scope');
  },
};

/**
 * Inyección de dependencias manual, una instancia por petición (F1-T09: un módulo por área).
 *
 * Cada módulo construye sus casos de uso con los repositorios Prisma y el contexto de tenant de la
 * petición. Un área nueva añade su módulo en `modules/` y una propiedad aquí.
 */
export class ScopedContainer {
  readonly auth: AuthModule;
  readonly leads: LeadModule;
  readonly leadStatuses: LeadStatusModule;
  readonly contacts: ContactModule;
  readonly companyContacts: CompanyContactModule;
  readonly email: EmailModule;
  readonly users: UserModule;
  readonly tenant: TenantModule;
  readonly products: ProductModule;

  /** @param tenantId Tenant de la sesión; sin él, solo sirven los casos de uso públicos (registro, login). */
  constructor(tenantId?: string) {
    const dependencies: ModuleDependencies = {
      prisma: PrismaService.getInstance().client,
      tenantContext: tenantId ? new TenantContext() : tenantlessContext,
    };

    this.auth = new AuthModule(dependencies);
    this.leads = new LeadModule(dependencies);
    this.leadStatuses = new LeadStatusModule(dependencies);
    this.contacts = new ContactModule(dependencies);
    this.companyContacts = new CompanyContactModule(dependencies);
    this.email = new EmailModule(dependencies);
    this.users = new UserModule(dependencies);
    this.tenant = new TenantModule(dependencies);
    this.products = new ProductModule(dependencies);
  }
}
