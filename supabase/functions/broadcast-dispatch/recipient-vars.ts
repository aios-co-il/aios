import type { Tables } from "../_shared/database.types.ts";
import { asRecord } from "../_shared/provider-json.ts";
import {
  buildTemplateVars,
  type TemplateVars,
} from "../_shared/broadcast/template/template-vars.ts";

export type RecipientRow = Tables<"broadcast_recipients">;

const varText = (value: unknown) => (value == null ? "" : String(value));

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
  const stored: TemplateVars =
    r.vars && typeof r.vars === "object"
      ? Object.fromEntries(
          Object.entries(r.vars).map(([key, value]) => [key, varText(value)]),
        )
      : {};
  return { ...base, ...stored };
}

/** The provider's message id at `key` of a send response, as text. */
export const providerMessageId = (json: unknown, key: string) => {
  const id = asRecord(json)[key];
  return id ? String(id) : undefined;
};
