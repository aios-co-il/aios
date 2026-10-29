// Response of GET /functions/v1/meta-data-deletion?code=, shared with the
// /data-deletion page. Statuses match the CHECK constraint in
// supabase/migrations/20261023100000_meta_data_deletion_requests.sql.

export const DELETION_REQUEST_STATUSES = [
  "received",
  "in_progress",
  "completed",
  "rejected",
] as const;

export type DeletionRequestStatusValue =
  (typeof DELETION_REQUEST_STATUSES)[number];

export interface DeletionRequestStatus {
  confirmation_code: string;
  status: DeletionRequestStatusValue;
  created_at: string;
}

export function isDeletionRequestStatusValue(
  value: unknown,
): value is DeletionRequestStatusValue {
  return (DELETION_REQUEST_STATUSES as readonly unknown[]).includes(value);
}

export function readDeletionRequestStatus(
  value: unknown,
): DeletionRequestStatus | null {
  if (!value || typeof value !== "object") return null;
  const confirmation_code =
    "confirmation_code" in value ? value.confirmation_code : undefined;
  const status = "status" in value ? value.status : undefined;
  const created_at = "created_at" in value ? value.created_at : undefined;
  if (
    typeof confirmation_code !== "string" ||
    !isDeletionRequestStatusValue(status) ||
    typeof created_at !== "string" ||
    Number.isNaN(Date.parse(created_at))
  ) {
    return null;
  }
  return { confirmation_code, status, created_at };
}
