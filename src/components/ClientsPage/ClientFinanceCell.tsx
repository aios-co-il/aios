import { Coins } from "lucide-react";
import type { ClientRow } from "./clientRow";

/** Who may see money figures, and where a client's figures come from. */
export interface ClientFinanceAccess {
  /** False while finance access is loading; the cell renders nothing meanwhile. */
  ready: boolean;
  canView: boolean;
  /** This tenant's own figures for a client (client_tenant_financial_data), if any. */
  tenantFiguresOf: (
    clientId: string,
  ) => { retainer?: number | null; monthly_budget?: number | null } | null;
  /** Agencies this tenant owns: only their clients fall back to the row's own figures. */
  ownedAgencyIds: ReadonlyArray<string>;
}

/**
 * A retainer or budget cell: the tenant's figure, else the row's own when the
 * client belongs to an owned agency; "מוסתר" for viewers without finance access.
 */
export function ClientFinanceCell({
  client,
  field,
  access,
}: {
  client: ClientRow;
  field: "retainer" | "monthly_budget";
  access: ClientFinanceAccess;
}) {
  if (!access.ready) {
    return null;
  }
  if (!access.canView) {
    return <span className="text-muted-foreground">מוסתר</span>;
  }
  const value =
    access.tenantFiguresOf(client.id)?.[field] ||
    (client.agency_id && access.ownedAgencyIds.includes(client.agency_id)
      ? client[field]
      : null);
  if (!value) {
    return <span className="text-muted-foreground">-</span>;
  }
  return (
    <span className="flex items-center gap-1 font-medium tabular-nums">
      <Coins className="h-4 w-4 text-muted-foreground" />₪
      {Number(value).toLocaleString()}
    </span>
  );
}
