import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";

export const companyContactFilterConfig: IFilterFieldConfig = {
    name: {
        allowedOperators: ["contains", "equals"],
        searchable: true,
    },
    industry: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    taxNumber: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    phone: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    email: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    address: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    city: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },
    state: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    zip: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    country: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    createdAt: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false
    },
}
