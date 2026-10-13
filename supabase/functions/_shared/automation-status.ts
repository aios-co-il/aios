export const AUTOMATION_STATUS_KINDS = [
  "response_status",
  "pipeline_stage",
  "task_status",
  "client_status",
  "onboarding_status",
] as const;

export type AutomationStatusKind = (typeof AUTOMATION_STATUS_KINDS)[number];

export const STATUS_CHANGE_TRIGGERS = [
  "lead_status_changed",
  "task_status_changed",
  "client_status_changed",
  "onboarding_status_changed",
] as const;

export const TASK_STATUS_OPTIONS = [
  { value: "open", label: "פתוח" },
  { value: "in_progress", label: "בתהליך" },
  { value: "done", label: "הושלם" },
];

export const CLIENT_STATUS_OPTIONS = [
  { value: "active", label: "פעיל" },
  { value: "onboarding", label: "בקליטה" },
  { value: "paused", label: "מושהה" },
  { value: "ended", label: "הסתיים" },
];

export const ONBOARDING_STATUS_OPTIONS = [
  { value: "research_meeting", label: "פגישת מחקר" },
  { value: "receiving_access", label: "קבלת גישות" },
  { value: "setup_and_content", label: "הקמה ותוכן" },
  { value: "campaign_live", label: "קמפיין באוויר" },
];

export type StatusStageScope = "lead" | "task" | "client" | "onboarding";

export function isAutomationStatusKind(
  value: unknown,
): value is AutomationStatusKind {
  return (
    typeof value === "string" &&
    (AUTOMATION_STATUS_KINDS as readonly string[]).includes(value)
  );
}

export function encodeStatusSelection(
  kind: AutomationStatusKind,
  value: string,
): string {
  return `${kind}:${value}`;
}

export function decodeStatusSelection(encoded: string | null | undefined): {
  kind: AutomationStatusKind | null;
  value: string;
} {
  const raw = String(encoded ?? "");
  const separator = raw.indexOf(":");
  if (separator > 0) {
    const kind = raw.slice(0, separator);
    if (isAutomationStatusKind(kind)) {
      return { kind, value: raw.slice(separator + 1) };
    }
  }
  return { kind: null, value: raw };
}

export function resolveStoredStatusSelection(
  stored: string,
  options: Array<{ kind: AutomationStatusKind; value: string }>,
): string {
  const decoded = decodeStatusSelection(stored);
  if (decoded.kind) return encodeStatusSelection(decoded.kind, decoded.value);
  const matches = options.filter((option) => option.value === stored);
  if (matches.length === 1) {
    return encodeStatusSelection(matches[0].kind, matches[0].value);
  }
  return stored;
}

export type StatusFilter = {
  value: string;
  kind?: string | null;
};

export function triggerScope(
  triggerType: string | null | undefined,
): StatusStageScope | null {
  if (triggerType === "lead_status_changed") return "lead";
  if (triggerType === "task_status_changed") return "task";
  if (triggerType === "client_status_changed") return "client";
  if (triggerType === "onboarding_status_changed") return "onboarding";
  return null;
}

export function scopesForTriggers(
  triggerTypes: Array<string | null | undefined>,
): StatusStageScope[] {
  const scopes: StatusStageScope[] = [];
  for (const triggerType of triggerTypes) {
    const scope = triggerScope(triggerType);
    if (scope && !scopes.includes(scope)) scopes.push(scope);
  }
  return scopes;
}

export function impliedStatusKind(
  triggerType: string | null | undefined,
): AutomationStatusKind | null {
  if (triggerType === "task_status_changed") return "task_status";
  if (triggerType === "client_status_changed") return "client_status";
  if (triggerType === "onboarding_status_changed") return "onboarding_status";
  return null;
}

export function readTriggerTypes(automation: {
  trigger_type?: string | null;
  configuration?: { trigger_types?: unknown } | null;
}): string[] {
  const configured = automation.configuration?.trigger_types;
  if (Array.isArray(configured)) {
    const types = configured
      .map((value) => String(value || ""))
      .filter(Boolean);
    if (types.length > 0) return types;
  }
  return automation.trigger_type ? [automation.trigger_type] : [];
}

function isStatusFilter(value: unknown): value is StatusFilter {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as StatusFilter).value === "string"
  );
}

export function readStatusFilters(
  source:
    | {
        filter_statuses?: unknown;
        new_statuses?: unknown;
        filter_status?: string | null;
        filter_status_kind?: string | null;
        new_status?: string | null;
        status_kind?: string | null;
      }
    | null
    | undefined,
): StatusFilter[] {
  const listed = source?.filter_statuses ?? source?.new_statuses;
  if (Array.isArray(listed)) {
    return listed
      .filter(isStatusFilter)
      .filter((filter) => filter.value && filter.value !== "any");
  }
  const single = source?.filter_status || source?.new_status;
  if (single && single !== "any") {
    return [
      {
        value: single,
        kind: source?.filter_status_kind || source?.status_kind || null,
      },
    ];
  }
  return [];
}

/** A saved filter matches the event key, and the kind when both sides recorded one. */
export function statusFilterMatches(
  filterStatus: string | null | undefined,
  filterKind: string | null | undefined,
  data: {
    status?: string | null;
    new_status?: string | null;
    status_kind?: string | null;
  },
): boolean {
  if (!filterStatus || filterStatus === "any") return true;
  const dataStatus = data.new_status || data.status || "";
  if (dataStatus !== filterStatus) return false;
  if (filterKind && data.status_kind && filterKind !== data.status_kind) {
    return false;
  }
  return true;
}

export function statusFiltersMatch(
  filters: StatusFilter[] | null | undefined,
  data: {
    status?: string | null;
    new_status?: string | null;
    status_kind?: string | null;
  },
): boolean {
  const active = (filters || []).filter(
    (filter) => filter.value && filter.value !== "any",
  );
  if (active.length === 0) return true;
  return active.some((filter) =>
    statusFilterMatches(filter.value, filter.kind, data),
  );
}

export function applyTriggerStatusFilters(
  conditions: Record<string, unknown>,
  encodedValues: string[] | null | undefined,
): void {
  const parsed = (encodedValues || [])
    .map((encoded) => decodeStatusSelection(encoded))
    .filter((item) => item.value && item.value !== "any");
  if (parsed.length === 0) {
    delete conditions.new_status;
    delete conditions.status_kind;
    delete conditions.new_statuses;
    return;
  }
  conditions.new_statuses = parsed.map((item) => ({
    value: item.value,
    kind: item.kind,
  }));
  conditions.new_status = parsed[0].value;
  if (parsed[0].kind) conditions.status_kind = parsed[0].kind;
  else delete conditions.status_kind;
}

export function encodeStoredTriggerFilters(
  source:
    | {
        filter_statuses?: unknown;
        new_statuses?: unknown;
        filter_status?: string | null;
        filter_status_kind?: string | null;
        new_status?: string | null;
        status_kind?: string | null;
      }
    | null
    | undefined,
): string[] {
  return readStatusFilters(source).map((filter) =>
    isAutomationStatusKind(filter.kind)
      ? encodeStatusSelection(filter.kind, filter.value)
      : filter.value,
  );
}

export function applyTriggerStatusCondition(
  conditions: Record<string, unknown>,
  encoded: string | null | undefined,
): void {
  if (!encoded || encoded === "any") {
    delete conditions.new_status;
    delete conditions.status_kind;
    return;
  }
  const { kind, value } = decodeStatusSelection(encoded);
  if (!value) return;
  conditions.new_status = value;
  if (kind) conditions.status_kind = kind;
  else delete conditions.status_kind;
}

export function applyStatusActionFields(
  configuration: Record<string, unknown>,
  encoded: string | null | undefined,
): void {
  const { kind, value } = decodeStatusSelection(encoded);
  configuration.status = value;
  if (kind === "response_status" || kind === "pipeline_stage") {
    configuration.status_field = kind;
  } else {
    delete configuration.status_field;
  }
}

export function encodeStoredTriggerStatus(
  conditions:
    | {
        new_status?: string | null;
        status_kind?: string | null;
      }
    | null
    | undefined,
): string {
  if (!conditions?.new_status || conditions.new_status === "any") return "any";
  if (isAutomationStatusKind(conditions.status_kind)) {
    return encodeStatusSelection(conditions.status_kind, conditions.new_status);
  }
  return conditions.new_status;
}

export function encodeStoredActionStatus(
  configuration:
    | {
        status?: string | null;
        status_field?: string | null;
        entity?: string | null;
      }
    | null
    | undefined,
): string {
  const status = configuration?.status || "";
  if (!status) return "";
  if (
    configuration?.status_field === "response_status" ||
    configuration?.status_field === "pipeline_stage"
  ) {
    return encodeStatusSelection(configuration.status_field, status);
  }
  if (configuration?.entity === "task") {
    return encodeStatusSelection("task_status", status);
  }
  if (configuration?.entity === "client") {
    return encodeStatusSelection("client_status", status);
  }
  return status;
}

export function leadStatusUpdateColumns(
  statusField: string | null | undefined,
  status: string,
): Record<string, string> {
  if (statusField === "response_status") return { response_status: status };
  return { status };
}

export function resolveStatusRecordId(
  entity: string | undefined,
  data: Record<string, unknown> | null | undefined,
): string | null {
  const record = data || {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }
    return null;
  };
  if (entity === "task") return pick("id", "task_id");
  if (entity === "client") return pick("id", "client_id");
  return pick("id", "lead_id");
}

export function statusUpdateTable(
  entity: string | undefined,
): "leads" | "tasks" | "clients" {
  if (entity === "task") return "tasks";
  if (entity === "client") return "clients";
  return "leads";
}

export function buildLeadStatusChangedData(input: {
  id: string;
  kind: "response_status" | "pipeline_stage";
  newStatus: string;
  oldStatus?: string | null;
  contact_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  agency_id?: string | null;
  sales_person_id?: string | null;
  tenant_id?: string | null;
  agency_name?: string | null;
}) {
  return {
    id: input.id,
    lead_id: input.id,
    status: input.newStatus,
    new_status: input.newStatus,
    old_status: input.oldStatus || "",
    status_kind: input.kind,
    contact_name: input.contact_name || "",
    company_name: input.company_name || "",
    phone: input.phone || "",
    email: input.email || "",
    agency_id: input.agency_id ?? null,
    sales_person_id: input.sales_person_id ?? null,
    tenant_id: input.tenant_id ?? null,
    agency_name: input.agency_name || "",
  };
}
