export interface CreateLeadDTO {
    companyName?: string,
    contactName: string,
    email?: string,
    phone?: string,
    statusId?: string,
    source?: string,
    assignedToId?: string,
    estimatedValue?: number,
    expectedCloseDate?: Date,
    notes?: string,
}