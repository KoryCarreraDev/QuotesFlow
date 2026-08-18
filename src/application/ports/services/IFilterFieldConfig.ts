export interface IFilterFieldConfig {
    [FieldName: string]: {
        allowedOperators: string[];
        searchable: boolean;
    };
}