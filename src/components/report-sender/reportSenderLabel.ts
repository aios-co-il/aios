import { resolveCarmenConnectionRole } from "../../../supabase/functions/_shared/carmen-connection-role.ts";
import type { ReportSender } from "../../../supabase/functions/_shared/report-sender/types.ts";

type Labelled = Pick<
  ReportSender,
  | "integration_type"
  | "display_name"
  | "last4"
  | "owner_name"
  | "owner_tenant_name"
  | "is_shared"
  | "carmen_role"
>;

/**
 * How a line is named to people: Carmen's main Manus line is "the phone of
 * Carmen", with its own name when it has one so two Manus lines differ;
 * other lines by their name, their owner, or the end of the instance id. A
 * line another organization shared says so.
 */
export function reportSenderLabel(sender: Labelled): string {
  const name = baseLabel(sender);
  if (!sender.is_shared) {
    return name;
  }
  return sender.owner_tenant_name
    ? `${name} (משותף מ-${sender.owner_tenant_name})`
    : `${name} (משותף)`;
}

/** The label in a list, marking a line that cannot send yet. */
export function reportSenderOptionLabel(
  sender: Labelled & Pick<ReportSender, "ready">,
): string {
  const label = reportSenderLabel(sender);
  return sender.ready ? label : `${label} (לא מחובר)`;
}

/** The name of the line itself, before any sharing note. */
function baseLabel(sender: Labelled): string {
  const isCarmen =
    sender.integration_type === "manus_wa" &&
    resolveCarmenConnectionRole(
      {
        integration_type: "manus_wa",
        settings: { carmen_role: sender.carmen_role },
      },
      { tenantHasActiveManus: true },
    ) === "primary";
  if (isCarmen) {
    return sender.display_name
      ? `הטלפון של כרמן · ${sender.display_name}`
      : "הטלפון של כרמן";
  }
  if (sender.display_name) {
    return sender.display_name;
  }
  if (sender.owner_name) {
    return `הטלפון של ${sender.owner_name}`;
  }
  return sender.last4 ? `וואטסאפ ··${sender.last4}` : "וואטסאפ";
}
