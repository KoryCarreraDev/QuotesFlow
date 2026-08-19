export interface IMapper<Entity, DTO> {
    toDTO(entity: Entity): DTO;
}