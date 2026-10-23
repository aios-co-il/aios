// Status values of meta_data_deletion_requests.status. Must match the CHECK
// constraint in supabase/migrations/20261023100000_meta_data_deletion_requests.sql.
export const DATA_DELETION_STATUS_LABELS = {
  received: "הבקשה התקבלה וממתינה לטיפול",
  in_progress: "הבקשה בטיפול",
  completed: "המחיקה הושלמה",
  rejected: "הבקשה נדחתה",
} as const;

export type DataDeletionStatus = keyof typeof DATA_DELETION_STATUS_LABELS;

export const DATA_DELETION_STATUSES = Object.keys(
  DATA_DELETION_STATUS_LABELS,
) as DataDeletionStatus[];

export function dataDeletionStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(
    DATA_DELETION_STATUS_LABELS,
    status,
  )
    ? DATA_DELETION_STATUS_LABELS[status as DataDeletionStatus]
    : status;
}
