import { invalidEnumMessage } from "@/lib/crmEnums";

export const CLIENT_FORM_STATUSES = [
  "active",
  "paused",
  "ended",
  "onboarding",
] as const;
export const CLIENT_FORM_TIERS = ["A", "B", "C"] as const;

export const toFormStatus = (status: string) =>
  CLIENT_FORM_STATUSES.find((value) => value === status);

export const toFormTier = (tier: string | null | undefined) =>
  tier ? CLIENT_FORM_TIERS.find((value) => value === tier) : null;

interface StoredClientEnums {
  status?: string | null;
  tier?: string | null;
}

interface SubmittedClientEnums {
  status?: string;
  tier?: string | null;
}

export interface UnrepresentableField {
  field: "status" | "tier";
  message: string;
}

/**
 * Stored tier/status values the edit form can't represent and the user left untouched.
 * Submitting must be blocked for these so the stored value is never overwritten with null.
 */
export function unrepresentableClientFields(
  stored: StoredClientEnums,
  submitted: SubmittedClientEnums,
): UnrepresentableField[] {
  const fields: UnrepresentableField[] = [];
  const status = stored.status || "active";
  if (toFormStatus(status) === undefined && submitted.status === undefined) {
    fields.push({
      field: "status",
      message: invalidEnumMessage(CLIENT_FORM_STATUSES, status),
    });
  }
  const { tier } = stored;
  if (tier && toFormTier(tier) === undefined && submitted.tier === undefined) {
    fields.push({
      field: "tier",
      message: invalidEnumMessage(CLIENT_FORM_TIERS, tier),
    });
  }
  return fields;
}
