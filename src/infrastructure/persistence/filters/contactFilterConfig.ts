import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";

export const contactFilterConfig: IFilterFieldConfig = {
    firstName: {
        allowedOperators: ["contains", "equals"],
        searchable: true,
    },
    lastName: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    email: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    phone: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    companyId: {
        allowedOperators: ["equals", "in"],
        searchable: false
    },
    createdAt: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false
    },
}
