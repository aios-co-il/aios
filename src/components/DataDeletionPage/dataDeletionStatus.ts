import type { DeletionRequestStatusValue } from "../../../supabase/functions/meta-data-deletion/contract.ts";

export const DATA_DELETION_STATUS_LABELS: Record<
  DeletionRequestStatusValue,
  string
> = {
  received: "הבקשה התקבלה וממתינה לטיפול",
  in_progress: "הבקשה בטיפול",
  completed: "המחיקה הושלמה",
  rejected: "הבקשה נדחתה",
};
