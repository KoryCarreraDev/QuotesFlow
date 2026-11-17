export interface UpdateLeadDTO {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  source?: string;
  assignedToId?: string;
  // Importe exacto como texto decimal (`"2500000.00"`), nunca number (F3-T01, H21).
  estimatedValue?: string;
  expectedCloseDate?: Date;
  notes?: string;
}
