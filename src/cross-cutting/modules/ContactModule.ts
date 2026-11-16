import { ContactMapper } from '../../application/mappers/ContactMapper.js';
import { CreateContactUseCase } from '../../application/use-case/contacts/createContactUseCase.js';
import { GetContactsUseCase } from '../../application/use-case/contacts/getContactsUseCase.js';
import { ListFilteredContactsUseCase } from '../../application/use-case/contacts/listFilteredContactsUseCase.js';
import { UpdateContactUseCase } from '../../application/use-case/contacts/updateContactUseCase.js';
import { GenericListFilteredUseCase } from '../../application/use-case/filter/GenericListFilteredUseCase.js';
import { contactFilterConfig } from '../../infrastructure/persistence/filters/contactFilterConfig.js';
import { PrismaContactRepository } from '../../infrastructure/persistence/repositories/PrismaContactRepository.js';
import { ModuleDependencies } from './ModuleDependencies.js';

/** Contactos (personas). */
export class ContactModule {
  private readonly contactMapper = new ContactMapper();

  constructor(private readonly dependencies: ModuleDependencies) {}

  private createContactRepository(): PrismaContactRepository {
    return new PrismaContactRepository(this.dependencies.prisma, this.dependencies.tenantContext);
  }

  getGetContactsUseCase(): GetContactsUseCase {
    return new GetContactsUseCase(this.createContactRepository(), this.contactMapper);
  }

  getCreateContactUseCase(): CreateContactUseCase {
    return new CreateContactUseCase(
      this.createContactRepository(),
      this.contactMapper,
      this.dependencies.tenantContext,
    );
  }

  getUpdateContactUseCase(): UpdateContactUseCase {
    return new UpdateContactUseCase(
      this.createContactRepository(),
      this.contactMapper,
      this.dependencies.tenantContext,
    );
  }

  getListFilteredContactsUseCase(): ListFilteredContactsUseCase {
    return new GenericListFilteredUseCase(this.createContactRepository(), this.contactMapper, contactFilterConfig);
  }
}
