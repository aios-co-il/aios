/**
 * Target checks for a user calling carmen-fb-tools / carmen-google-tools:
 * every client, Meta ad account and Google Ads customer the call touches must
 * belong to the caller's tenant, or to an agency shared with that tenant
 * through agency_tenant_access (read_write for writes).
 *
 * An ad account or customer belongs to a client through
 * clients.meta_ads_account_id / clients.google_ads_account_id or a report
 * table (crm_tables.client_id + integration_settings), the same links
 * carmen-fb-tools uses to find a client's ad account. Anything that cannot be
 * linked to an in-scope client is refused. When the call names a client_id,
 * the Meta object must sit under that client.
 */

export type AdToolAccess = "read" | "write";
export type AdScope = { tenantId: string; access: AdToolAccess };
export type ScopeClient = {
  id: string;
  tenant_id: string | null;
  agency_id: string | null;
};

export type AdScopeStore = {
  clientsByIds(ids: string[]): Promise<ScopeClient[]>;
  clientIdsForMetaAccount(variants: string[]): Promise<string[]>;
  clientIdsForGoogleCustomer(variants: string[]): Promise<string[]>;
  sharedAgencyIds(tenantId: string, access: AdToolAccess): Promise<string[]>;
};

export type AdToolDenied = {
  ok: false;
  status: 400 | 401 | 403;
  error: string;
  message?: string;
};
export type TargetResult = { ok: true } | AdToolDenied;

const OK: TargetResult = { ok: true };

function outOfScope(scope: AdScope): AdToolDenied {
  return {
    ok: false,
    status: 403,
    error: "target_out_of_scope",
    message:
      scope.access === "write"
        ? "הלקוח או החשבון לא שייכים לארגון שלך או לסוכנות שיש לך הרשאת עריכה אליה."
        : "הלקוח או החשבון לא שייכים לארגון שלך או לסוכנות שיש לך גישה אליה.",
  };
}

/** The caller's own Meta token cannot read the object, or there is none. */
const fbObjectUnreachable: AdToolDenied = {
  ok: false,
  status: 403,
  error: "fb_object_unreachable",
  message: "לארגון שלך אין חיבור Meta עם גישה לפריט הזה.",
};

const invalid = (error: string): AdToolDenied => ({
  ok: false,
  status: 400,
  error,
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isNumericId(id: unknown): boolean {
  return /^\d+$/.test(String(id ?? "").trim());
}

/** "123" / "act_123" → both spellings, as stored in clients and crm_tables. */
export function metaAccountVariants(id: unknown): string[] | null {
  const digits = String(id ?? "")
    .trim()
    .replace(/^act_/, "");
  return /^\d+$/.test(digits) ? [digits, `act_${digits}`] : null;
}

/** "1234567890" / "123-456-7890" → both spellings. */
export function googleCustomerVariants(id: unknown): string[] | null {
  const digits = String(id ?? "")
    .trim()
    .replace(/-/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length !== 10) return [digits];
  const dashed = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return [digits, dashed];
}

export function clientInScope(
  client: ScopeClient,
  tenantId: string,
  sharedAgencyIds: readonly string[],
): boolean {
  if (client.tenant_id && client.tenant_id === tenantId) return true;
  return !!client.agency_id && sharedAgencyIds.includes(client.agency_id);
}

async function anyClientInScope(
  store: AdScopeStore,
  scope: AdScope,
  clientIds: string[],
): Promise<boolean> {
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!ids.length) return false;
  const [clients, agencies] = await Promise.all([
    store.clientsByIds(ids),
    store.sharedAgencyIds(scope.tenantId, scope.access),
  ]);
  return clients.some((c) => clientInScope(c, scope.tenantId, agencies));
}

/** A body client_id (optional) must be in scope. */
export async function checkClientTarget(
  store: AdScopeStore,
  scope: AdScope,
  clientId: unknown,
): Promise<TargetResult> {
  if (clientId == null || clientId === "") return OK;
  // clients.id is a uuid: anything else would fail the lookup with a 500.
  if (typeof clientId !== "string" || !UUID_RE.test(clientId))
    return invalid("invalid_client_id");
  return (await anyClientInScope(store, scope, [clientId]))
    ? OK
    : outOfScope(scope);
}

/** Body field that names the Meta object each carmen-fb-tools action changes. */
export const FB_ENTITY_FIELD: Readonly<Record<string, string>> = {
  create_adset: "campaign_id",
  create_ad: "adset_id",
  replace_lead_form: "ad_id",
  update_budget: "entity_id",
  pause: "entity_id",
  resume: "entity_id",
  duplicate_ad_variants: "source_ad_id",
};

/** The Meta object's ad account (read from the Graph API) must be in scope,
 * and linked to the body client_id when one is named. */
export async function checkFbEntityTarget(input: {
  action: string;
  body: Record<string, unknown>;
  scope: AdScope;
  store: AdScopeStore;
  /** null: the caller's token cannot read the object. */
  fetchAccountId(entityId: string): Promise<string | null>;
}): Promise<TargetResult> {
  const field = FB_ENTITY_FIELD[input.action];
  if (!field) return OK;
  const entityId = input.body[field];
  // Missing: the action itself answers "<field> required".
  if (entityId == null || entityId === "") return OK;
  if (!isNumericId(entityId)) return invalid(`invalid_${field}`);
  const account = await input.fetchAccountId(String(entityId).trim());
  if (!account) return fbObjectUnreachable;
  const variants = metaAccountVariants(account);
  if (!variants) return outOfScope(input.scope);
  const clientIds = await input.store.clientIdsForMetaAccount(variants);
  // A uuid may arrive in upper case; Postgres returns ids in lower case.
  const named = input.body.client_id;
  const owners =
    typeof named === "string" && named
      ? clientIds.filter((id) => id.toLowerCase() === named.toLowerCase())
      : clientIds;
  return (await anyClientInScope(input.store, input.scope, owners))
    ? OK
    : outOfScope(input.scope);
}

/** carmen-google-tools: the customer must be in scope; ids must be numeric. */
export async function checkGoogleTarget(input: {
  body: Record<string, unknown>;
  scope: AdScope;
  store: AdScopeStore;
}): Promise<TargetResult> {
  const { customer_id, campaign_id } = input.body;
  if (customer_id == null || customer_id === "") return OK;
  const variants = googleCustomerVariants(customer_id);
  if (!variants) return invalid("invalid_customer_id");
  if (campaign_id != null && campaign_id !== "" && !isNumericId(campaign_id))
    return invalid("invalid_campaign_id");
  const clientIds = await input.store.clientIdsForGoogleCustomer(variants);
  return (await anyClientInScope(input.store, input.scope, clientIds))
    ? OK
    : outOfScope(input.scope);
}
