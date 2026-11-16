/**
 * Conversión de una entidad de dominio a su DTO de salida. Nunca expone campos internos (tenant, borrado).
 */
export interface IMapper<Entity, DTO> {
  toDTO(entity: Entity): DTO;
}
