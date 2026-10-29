import { z } from "npm:zod@3.25.76";
import type { Tables } from "../_shared/database.types.ts";
import {
  buildTemplateVars,
  type TemplateVars,
} from "../_shared/broadcast/template/template-vars.ts";

export type RecipientRow = Tables<"broadcast_recipients">;

const varText = (value: unknown) => (value == null ? "" : String(value));

/** A vars snapshot as text values; arrays keep their index keys, anything else reads as none. */
const storedVarsSchema = z
  .union([z.array(z.unknown()), z.record(z.unknown())])
  .catch({})
  .transform((vars): TemplateVars =>
    Object.fromEntries(
      Object.entries(vars).map(([key, value]) => [key, varText(value)]),
    ),
  );

const sendResponseSchema = z.record(z.unknown()).catch({});

// Merge fields come from the recipient's vars snapshot; older rows (before
// vars existed) fall back to name / phone / email columns.
export function recipientVars(
  r: Pick<
    RecipientRow,
    "contact_name" | "email" | "phone" | "entity_type" | "vars"
  >,
): TemplateVars {
  const base = buildTemplateVars({
    contact_name: r.contact_name,
    email: r.email,
    phone: r.entity_type === "wa_group" ? null : r.phone,
  });
  return { ...base, ...storedVarsSchema.parse(r.vars) };
}

/** The provider's message id at `key` of a send response, as text. */
export const providerMessageId = (json: unknown, key: string) => {
  const id = sendResponseSchema.parse(json)[key];
  return id ? String(id) : undefined;
};
