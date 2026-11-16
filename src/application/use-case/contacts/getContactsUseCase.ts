import { ContactDTO } from '../../dtos/ContactDTO.js';
import { IContactMapper } from '../../ports/mappers/IContactMapper.js';
import { IContactRepository } from '../../ports/repositories/IContactRepository.js';
import { Action, type Actor, scopeFor } from '../../policies/authorizationPolicy.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';

/** Contactos de la empresa; un comercial solo ve aquellos de los que es responsable (D-18). */
export class GetContactsUseCase {
  constructor(
    private readonly contactRepo: IContactRepository,
    private readonly contactMapper: IContactMapper,
  ) {}

  async execute(actor: Actor): Promise<ContactDTO[]> {
    const scope = scopeFor(actor, Action.CONTACT_LIST);
    if (scope.kind === 'none') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    const contacts = await this.contactRepo.findByTenant(scope.kind === 'own' ? scope.userId : undefined);
    return contacts.map((entity) => this.contactMapper.toDTO(entity));
  }
}
