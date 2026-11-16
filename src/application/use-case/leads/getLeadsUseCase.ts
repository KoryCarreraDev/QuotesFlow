import { ILeadRepository } from '../../../application/ports/repositories/ILeadRepository.js';
import { ILeadMapper } from '../../../application/ports/mappers/ILeadMapper.js';
import { LeadDTO } from '../../../application/dtos/LeadDTO.js';
import { Role } from '../../../domain/enums/Role.js';
import { Action, scopeFor } from '../../policies/authorizationPolicy.js';
import { ErrorCode } from '../../../domain/errors/ErrorCode.js';
import { ForbiddenError } from '../../../domain/errors/ForbiddenError.js';

export class GetLeadsUseCase {
  constructor(
    private readonly leadRepo: ILeadRepository,
    private readonly leadMapper: ILeadMapper,
  ) {}

  async execute(rolUser: Role, assignedTo?: string): Promise<LeadDTO[]> {
    const scope = scopeFor({ role: rolUser, userId: assignedTo }, Action.LEAD_LIST);
    if (scope.kind === 'none') {
      throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
    }

    const leads = await this.leadRepo.findByTenant(scope.kind === 'own' ? scope.userId : undefined);
    return leads.map(this.leadMapper.toDTO);
  }
}
