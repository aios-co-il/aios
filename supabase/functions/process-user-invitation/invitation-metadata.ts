import { z } from "npm:zod@3.25.76";

const stringField = z.string().optional().catch(undefined);

const stringListField = z
  .array(z.unknown())
  .transform((items) =>
    items.filter((item): item is string => typeof item === "string"),
  )
  .optional()
  .catch(undefined);

const invitationMetadataSchema = z
  .object({
    fullName: stringField,
    role: stringField,
    agencyIds: stringListField,
    modulePermissions: stringListField,
    campaignerId: stringField,
    salesPersonId: stringField,
  })
  .catch({});

export type InvitationMetadata = z.infer<typeof invitationMetadataSchema>;

/** Reads user_invitations.metadata; a missing value throws like destructuring it would. */
export function parseInvitationMetadata(value: unknown): InvitationMetadata {
  if (value === null || value === undefined) {
    throw new TypeError("Invitation metadata is missing");
  }
  return invitationMetadataSchema.parse(value);
}
