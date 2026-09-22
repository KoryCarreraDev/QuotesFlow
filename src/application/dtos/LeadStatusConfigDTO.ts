export interface LeadStatusConfigDTO {
    id: string,
    name: string,
    color: string | undefined,
    order: number,
    isDefault: boolean,
    deleted?: string,
}