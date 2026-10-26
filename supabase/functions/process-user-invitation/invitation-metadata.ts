import { unknownField } from "../_shared/json-fields.ts";

export interface InvitationMetadata {
  fullName?: string;
  role?: string;
  agencyIds?: string[];
  modulePermissions?: string[];
  campaignerId?: string;
  salesPersonId?: string;
}

function stringField(value: unknown, key: string): string | undefined {
  const field = unknownField(value, key);
  return typeof field === "string" ? field : undefined;
}

function stringListField(value: unknown, key: string): string[] | undefined {
  const field = unknownField(value, key);
  return Array.isArray(field)
    ? field.filter((item): item is string => typeof item === "string")
    : undefined;
}

/** Reads user_invitations.metadata; a missing value throws like destructuring it would. */
export function parseInvitationMetadata(value: unknown): InvitationMetadata {
  if (value === null || value === undefined) {
    throw new TypeError("Invitation metadata is missing");
  }
  return {
    fullName: stringField(value, "fullName"),
    role: stringField(value, "role"),
    agencyIds: stringListField(value, "agencyIds"),
    modulePermissions: stringListField(value, "modulePermissions"),
    campaignerId: stringField(value, "campaignerId"),
    salesPersonId: stringField(value, "salesPersonId"),
  };
}
