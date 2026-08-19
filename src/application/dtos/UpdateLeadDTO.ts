export interface UpdateLeadDTO {
    companyName?: string,
    contactName?: string,
    email?: string,
    phone?: string,
    source?: string,
    assignedToId?: string,
    estimatedValue?: number,
    expectedCloseDate?: Date,
    notes?: string,
}