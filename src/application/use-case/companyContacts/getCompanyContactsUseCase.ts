import { CompanyContactDTO } from '../../dtos/CompanyContactDTO.js';
import { ICompanyContactMapper } from '../../ports/mappers/ICompanyContactMapper.js';
import { ICompanyContactRepository } from '../../ports/repositories/ICompanyContactRepository.js';
import { Action, type Actor, scopeFor } from '../../policies/authorizationPolicy.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';

/** Empresas cliente; un comercial solo ve aquellas de las que es responsable (D-18). */
export class GetCompanyContactsUseCase {
  constructor(
    private readonly companyContactRepository: ICompanyContactRepository,
    private readonly companyContactMapper: ICompanyContactMapper,
  ) {}

  async execute(actor: Actor): Promise<CompanyContactDTO[]> {
    const scope = scopeFor(actor, Action.COMPANY_CONTACT_LIST);
    if (scope.kind === 'none') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }
    const companyContacts = await this.companyContactRepository.findByTenant(
      scope.kind === 'own' ? scope.userId : undefined,
    );
    return companyContacts.map((entity) => this.companyContactMapper.toDTO(entity));
  }
}
