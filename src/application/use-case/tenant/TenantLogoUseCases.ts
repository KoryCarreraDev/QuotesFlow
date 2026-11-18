import { randomUUID } from 'node:crypto';
import { TenantProfileDTO } from '@/application/dtos/TenantProfileDTO.js';
import { toTenantProfileDTO } from '@/application/mappers/TenantProfileMapper.js';
import { ITenantProfileRepository, TenantProfile } from '@/application/ports/repositories/ITenantProfileRepository.js';
import { AuditAction, AuditEntity, IAuditLogger } from '@/application/ports/services/IAuditLogger.js';
import { IFileStorage, StoredFile } from '@/application/ports/services/IFileStorage.js';
import { ILogger } from '@/application/ports/services/ILogger.js';
import { ITenantContext } from '@/application/ports/services/ITenantContext.js';
import { ITransactionManager } from '@/application/ports/services/ITransactionManager.js';
import { Action, Actor, can } from '@/application/policies/authorizationPolicy.js';
import { ErrorCode } from '@/domain/errors/ErrorCode.js';
import { ForbiddenError } from '@/domain/errors/ForbiddenError.js';
import { NotFoundError } from '@/domain/errors/NotFoundError.js';
import { ValidationError } from '@/domain/errors/ValidationError.js';
import { inspectLogoImage } from '@/domain/value-objects/logoImage.js';

// F3-T07: logo de la empresa. Lo sube y lo quita el dueño o el socio (`tenant:update`); lo ve todo el equipo.

function assertAllowed(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new ForbiddenError(ErrorCode.INSUFFICIENT_PERMISSIONS, 'Insufficient permissions');
}

async function loadProfile(repository: ITenantProfileRepository): Promise<TenantProfile> {
  const profile = await repository.findCurrent();
  // Con sesión válida la empresa existe y está activa: es un fallo interno.
  if (!profile) throw new Error('Tenant of the session not found');
  return profile;
}

/** Borrar el archivo viejo es limpieza: si falla, no debe deshacer un cambio que ya se confirmó. */
async function deleteQuietly(storage: IFileStorage, logger: ILogger, key: string | undefined): Promise<void> {
  if (!key) return;
  try {
    await storage.delete(key);
  } catch (error) {
    logger.warn('Could not delete a replaced logo file', { error: error instanceof Error ? error.message : 'unknown' });
  }
}

/**
 * Sube o reemplaza el logo. El tipo de archivo sale de su contenido (PNG o JPEG), con tope de tamaño y de píxeles.
 * El archivo nuevo se guarda antes que la clave; si guardar la clave falla, se borra el archivo nuevo, y el anterior
 * solo se borra cuando el cambio ya se confirmó.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {ValidationError} `INVALID_LOGO_IMAGE` si no es un PNG o JPEG válido de tamaño permitido.
 */
export class UploadTenantLogoUseCase {
  constructor(
    private readonly profiles: ITenantProfileRepository,
    private readonly storage: IFileStorage,
    private readonly tenantContext: ITenantContext,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
    private readonly logger: ILogger,
  ) {}

  async execute(actor: Actor, content: Uint8Array): Promise<TenantProfileDTO> {
    assertAllowed(actor, Action.TENANT_UPDATE);
    const image = inspectLogoImage(content);
    if (!image) {
      throw new ValidationError(
        ErrorCode.INVALID_LOGO_IMAGE,
        'Logo must be a PNG or JPEG image of up to 2 MB and 2000 x 2000 pixels',
      );
    }

    const previousKey = (await loadProfile(this.profiles)).logoKey;
    const key = `logos/${this.tenantContext.getTenantId()}/${randomUUID()}.${image.extension}`;
    await this.storage.save(key, content, image.contentType);

    let profile: TenantProfile;
    try {
      profile = await this.transactionManager.runInTransaction(async () => {
        await this.profiles.updateLogoKey(key);
        const updated = await loadProfile(this.profiles);
        await this.auditLogger.record({
          action: AuditAction.TENANT_LOGO_UPDATED,
          entity: AuditEntity.TENANT,
          entityId: updated.id,
          metadata: { format: image.format },
        });
        return updated;
      });
    } catch (error) {
      await deleteQuietly(this.storage, this.logger, key);
      throw error;
    }
    await deleteQuietly(this.storage, this.logger, previousKey);
    return toTenantProfileDTO(profile);
  }
}

/**
 * Quita el logo. Sin logo no hace nada.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 */
export class RemoveTenantLogoUseCase {
  constructor(
    private readonly profiles: ITenantProfileRepository,
    private readonly storage: IFileStorage,
    private readonly transactionManager: ITransactionManager,
    private readonly auditLogger: IAuditLogger,
    private readonly logger: ILogger,
  ) {}

  async execute(actor: Actor): Promise<void> {
    assertAllowed(actor, Action.TENANT_UPDATE);
    const profile = await loadProfile(this.profiles);
    if (!profile.logoKey) return;

    await this.transactionManager.runInTransaction(async () => {
      await this.profiles.updateLogoKey(null);
      await this.auditLogger.record({
        action: AuditAction.TENANT_LOGO_REMOVED,
        entity: AuditEntity.TENANT,
        entityId: profile.id,
      });
    });
    await deleteQuietly(this.storage, this.logger, profile.logoKey);
  }
}

/**
 * El logo de la empresa de la sesión.
 *
 * @throws {ForbiddenError} `INSUFFICIENT_PERMISSIONS`.
 * @throws {NotFoundError} `LOGO_NOT_FOUND` si la empresa no tiene logo (o falta su archivo).
 */
export class GetTenantLogoUseCase {
  constructor(
    private readonly profiles: ITenantProfileRepository,
    private readonly storage: IFileStorage,
  ) {}

  async execute(actor: Actor): Promise<StoredFile> {
    assertAllowed(actor, Action.TENANT_VIEW);
    const { logoKey } = await loadProfile(this.profiles);
    const file = logoKey ? await this.storage.read(logoKey) : null;
    if (!file) throw new NotFoundError(ErrorCode.LOGO_NOT_FOUND, 'Company has no logo');
    return file;
  }
}
