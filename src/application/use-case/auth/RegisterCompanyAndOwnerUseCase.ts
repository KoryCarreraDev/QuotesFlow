import { DeletedState } from '@/domain/enums/DeletedState.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ConflictError } from '@/domain/errors/ConflictError.js';
import { ITenantRepository } from '../../ports/repositories/ITenantRepository.js';
import { IUserRepository } from '../../ports/repositories/IUserRepository.js';
import { IHashService } from '../../ports/services/IHashService.js';
import { ITransactionManager } from '../../ports/services/ITransactionManager.js';
import { ILeadStatusConfigRepository } from '@/application/ports/repositories/ILeadStatusConfigRepository.js';
import { RegisterCompanyDTO } from '../../dtos/RegisterCompanyDTO.js';
import { Tenant } from '../../../domain/entities/Tenant.js';
import { User } from '../../../domain/entities/User.js';
import { Role } from '../../../domain/enums/Role.js';
import { defaultLeadStatuses } from '@/application/constants/defaultLeadStatuses.js';
import { LeadStatusConfig } from '@/domain/entities/LeadStatusConfig.js';

/**
 * Registro de una empresa nueva con su dueño (OWNER) y los 5 estados de lead por defecto, todo en una transacción (H8).
 *
 * @throws {ConflictError} `EMAIL_ALREADY_IN_USE`.
 */
export class RegisterCompanyAndOwnerUseCase {
  constructor(
    private tenantRepository: ITenantRepository,
    private userRepository: IUserRepository,
    private hashService: IHashService,
    private leadStatusRepository: ILeadStatusConfigRepository,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
  ) {}

  async execute(dto: RegisterCompanyDTO) {
    const existingUser = await this.userRepository.findByEmail(dto.ownerEmail);
    if (existingUser) {
      throw new ConflictError(ErrorCode.EMAIL_ALREADY_IN_USE, 'Email already in use');
    }

    const tenant = Tenant.create({ name: dto.companyName });
    const passwordHash = await this.hashService.hash(dto.password);

    const owner = User.create({
      email: dto.ownerEmail,
      passwordHash,
      firstName: dto.ownerFirstName,
      lastName: dto.ownerLastName,
      role: Role.OWNER,
      tenantId: tenant.id,
    });

    // Todo o nada (H8): una empresa sin dueño o sin estados no puede usarse ni volver a registrarse.
    await this.transactionManager.runInTransaction(async () => {
      await this.tenantRepository.create(tenant);
      await this.userRepository.create(owner);

      for (const statusData of defaultLeadStatuses) {
        const status = LeadStatusConfig.create({
          name: statusData.name,
          order: statusData.order,
          isDefault: statusData.isDefault,
          tenantId: tenant.id,
          color: statusData.color,
          type: statusData.type,
          deleted: DeletedState.ACTIVE,
        });
        await this.leadStatusRepository.create(status);
      }

      await this.auditLogger.record({
        action: AuditAction.COMPANY_REGISTERED,
        entity: AuditEntity.TENANT,
        entityId: tenant.id,
        publicActor: { userId: owner.id, tenantId: tenant.id },
      });
    });

    return { tenantId: tenant.id, ownerId: owner.id };
  }
}
