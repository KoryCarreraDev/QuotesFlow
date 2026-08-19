import { IFilterFieldConfig } from "@/application/ports/services/IFilterFieldConfig.js";

export const leadFilterConfig: IFilterFieldConfig = {
    companyName: {
        allowedOperators: ["contains", "equals"],
        searchable: true,
    },
    contactName: {
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
    statusId: {
        allowedOperators: ["equals", "in"],
        searchable: false
    },
    source: {
        allowedOperators: ["contains", "equals"],
        searchable: false
    },
    assignedToId: {
        allowedOperators: ["equals", "in"],
        searchable: false
    },
    estimatedValue: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false
    },
    expectedCloseDate: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false
    },
    createdAt: {
        allowedOperators: ["equals", "gt", "gte", "lt", "lte"],
        searchable: false
    },
    notes: {
        allowedOperators: ["contains", "equals"],
        searchable: true
    },

}