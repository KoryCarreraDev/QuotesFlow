export interface FilterCriteriaDTO {
    filters?: Array<{ field: string; operator: string; value: unknown}>;
    search?: string;
    page?: number;
    limit?: number;
};