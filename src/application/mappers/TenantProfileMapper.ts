import { TenantProfileDTO, TENANT_LOGO_PATH } from '../dtos/TenantProfileDTO.js';
import { TenantProfile } from '../ports/repositories/ITenantProfileRepository.js';

/** Perfil a DTO: la clave interna del logo se cambia por la ruta pública que lo sirve. */
export function toTenantProfileDTO(profile: TenantProfile): TenantProfileDTO {
  const { logoKey, ...publicFields } = profile;
  return { ...publicFields, logoUrl: logoKey ? TENANT_LOGO_PATH : undefined };
}
