import { Action } from '../../application/policies/authorizationPolicy.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/repositories/PrismaUserRepository.js';
import { PrismaAuditLogger } from '../../infrastructure/persistence/repositories/PrismaAuditLogger.js';
import { ContactMapper } from '../../application/mappers/ContactMapper.js';
import { CreateContactUseCase } from '../../application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '../../application/use-case/contacts/getContactsUseCase.js';
import { ListFilteredContactsUseCase } from '../../application/use-case/contacts/listFilteredContactsUseCase.js';
import { UpdateContactUseCase } from '../../application/use-case/contacts/updateContactUseCase.js';
import { DeleteContactUseCase } from '../../application/use-case/contacts/deleteContactUseCase.js';
import { PrismaCompanyContactRepository } from '../../infrastructure/persistence/repositories/PrismaCompanyContactRepository.js';
import { GenericListFilteredUseCase } from '../../application/use-case/filter/GenericListFilteredUseCase.js';
import { contactFilterConfig } from '../../infrastructure/persistence/filters/contactFilterConfig.js';
import { PrismaContactRepository } from '../../infrastructure/persistence/repositories/PrismaContactRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Contactos (personas). */
export class ContactModule {
  private readonly contactMapper = new ContactMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createAuditLogger(): PrismaAuditLogger {
    return new PrismaAuditLogger(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  private createContactRepository(): PrismaContactRepository {
    return new PrismaContactRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetContactsUseCase(): GetContactsUseCase {
    return new GetContactsUseCase(this.createContactRepository(), this.contactMapper);
  }

  private createCompanyContactRepository(): PrismaCompanyContactRepository {
    return new PrismaCompanyContactRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getCreateContactUseCase(): CreateContactUseCase {
    return new CreateContactUseCase(
      this.createContactRepository(),
      this.contactMapper,
      this.dependencies.tenantContext,
      this.createCompanyContactRepository(),
      this.createAuditLogger(),
      new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext),
    );
  }

  getUpdateContactUseCase(): UpdateContactUseCase {
    return new UpdateContactUseCase(
      this.createContactRepository(),
      this.contactMapper,
      this.dependencies.tenantContext,
      this.createCompanyContactRepository(),
      this.createAuditLogger(),
      new PrismaUserRepository(this.dependencies.prisma, this.dependencies.tenantContext),
    );
  }

  getDeleteContactUseCase(): DeleteContactUseCase {
    return new DeleteContactUseCase(this.createContactRepository(), this.createAuditLogger());
  }

  getListFilteredContactsUseCase(): ListFilteredContactsUseCase {
    return new GenericListFilteredUseCase(this.createContactRepository(), this.contactMapper, contactFilterConfig, {
      action: Action.CONTACT_LIST,
      ownerField: 'ownerId',
    });
  }
}
