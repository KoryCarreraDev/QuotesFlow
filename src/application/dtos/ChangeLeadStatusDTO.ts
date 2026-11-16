export interface ChangeLeadStatusDTO {
  statusId: string;
  /** Motivo o comentario del cambio; queda en el historial. */
  note?: string;
}
