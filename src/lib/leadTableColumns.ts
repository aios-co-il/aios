export type LeadTableColumnField = {
  key: string;
  label: string;
  type: string;
  /** Always shown in the CRM table; cannot be hidden. */
  required: boolean;
  /** Missing org preference. Current columns stay on; added columns stay off. */
  defaultVisible?: boolean;
  /** Stored apart from the form field so a hidden column does not hide the form. */
  visibilityKey?: string;
};

export const LEAD_TABLE_COLUMN_PREF_PREFIX = "table_column:";

export function isLeadTableColumnPreferenceKey(fieldKey: string): boolean {
  return fieldKey.startsWith(LEAD_TABLE_COLUMN_PREF_PREFIX);
}

export function leadTableColumnVisibilityKey(field: {
  key: string;
  visibilityKey?: string;
}): string {
  return field.visibilityKey ?? field.key;
}

export const LEAD_TABLE_COLUMN_FIELDS: LeadTableColumnField[] = [
  { key: "contact_name", label: "שם", type: "text", required: true },
  { key: "created_at", label: "תאריך", type: "date", required: false },
  { key: "sales_person", label: "משתמש", type: "text", required: false },
  { key: "phone", label: "טלפון", type: "phone", required: false },
  { key: "company_name", label: "שם חברה", type: "text", required: false },
  { key: "campaign_name", label: "שם קמפיין", type: "text", required: false },
  { key: "source", label: "מקור הליד", type: "select", required: false },
  { key: "status", label: "שלב במשפך", type: "select", required: false },
  { key: "response_status", label: "סטטוס", type: "select", required: false },
  { key: "tags", label: "תגיות", type: "text", required: false },
  {
    key: "follow_up_date",
    label: "תאריך לחזרה",
    type: "date",
    required: false,
  },
  { key: "actions", label: "פעולות", type: "text", required: true },
  extraColumn("email", "אימייל", "email"),
  extraColumn("notes", "הערות", "textarea"),
  extraColumn("industry", "תחום עיסוק", "text"),
  extraColumn("products", "מוצרים", "text"),
  extraColumn("monthly_budget", "תקציב", "number"),
  extraColumn("three_month_budget", "הצעה 3 חודשים", "number"),
  extraColumn("estimated_deal_value", "שווי עסקה", "number"),
  extraColumn("proposal_date", "תאריך הצעה", "date"),
  extraColumn("won_date", "תאריך סגירה", "date"),
  extraColumn("meeting_date", "תאריך פגישה", "date"),
  extraColumn("meeting_time", "שעת פגישה", "text"),
  extraColumn("meeting_location", "מיקום פגישה", "text"),
  extraColumn("folder_link", "קישור לתיקייה", "text"),
  extraColumn("lost_reason", "סיבת אובדן", "text"),
  extraColumn("files", "קבצים", "text"),
  extraColumn("call_recording", "הקלטת שיחה", "text"),
];

function extraColumn(
  key: string,
  label: string,
  type: string,
): LeadTableColumnField {
  return {
    key,
    label,
    type,
    required: false,
    defaultVisible: false,
    visibilityKey: `${LEAD_TABLE_COLUMN_PREF_PREFIX}${key}`,
  };
}

export const LEAD_TABLE_TOGGLEABLE_COLUMNS = LEAD_TABLE_COLUMN_FIELDS.filter(
  (field) => !field.required,
);

/** Added columns. Hidden until the org turns them on. */
export const LEAD_TABLE_OPTIONAL_COLUMNS = LEAD_TABLE_COLUMN_FIELDS.filter(
  (field) => field.defaultVisible === false,
);

export function isLeadTableColumnVisible(
  fieldKey: string,
  isFieldVisible: (key: string, defaultVisible?: boolean) => boolean,
): boolean {
  const field = LEAD_TABLE_COLUMN_FIELDS.find((item) => item.key === fieldKey);
  if (field?.required) return true;
  return isFieldVisible(
    field ? leadTableColumnVisibilityKey(field) : fieldKey,
    field?.defaultVisible ?? true,
  );
}

/** Browser-local CRM table widths. Column ids match the lead table, not field keys. */
export const LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY = "leads-table-column-widths";
export const LEAD_TABLE_COLUMN_WIDTHS_EVENT = "leads-table-column-widths";
export const LEAD_TABLE_COLUMN_MIN_WIDTH = 80;
export const LEAD_TABLE_COLUMN_MAX_WIDTH = 800;

const LEAD_TABLE_WIDTH_COLUMN_IDS = new Set([
  "name",
  "created_at",
  "sales_person",
  "phone",
  "company",
  "campaign_name",
  "source",
  "status",
  "response_status",
  "tags",
  "follow_up_date",
  "actions",
  "email",
  "notes",
  "industry",
  "products",
  "monthly_budget",
  "three_month_budget",
  "estimated_deal_value",
  "proposal_date",
  "won_date",
  "meeting_date",
  "meeting_time",
  "meeting_location",
  "folder_link",
  "lost_reason",
  "files",
  "call_recording",
]);

export function parseLeadTableColumnWidths(
  raw: string | null | undefined,
): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const widths: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (!LEAD_TABLE_WIDTH_COLUMN_IDS.has(id) && !id.startsWith("cf:"))
        continue;
      const width = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(width)) continue;
      widths[id] = Math.round(
        Math.min(
          LEAD_TABLE_COLUMN_MAX_WIDTH,
          Math.max(LEAD_TABLE_COLUMN_MIN_WIDTH, width),
        ),
      );
    }
    return widths;
  } catch {
    return {};
  }
}

let memoryWidths: Record<string, number> | null = null;

export function readLeadTableColumnWidths(
  storage?: Pick<Storage, "getItem"> | null,
): Record<string, number> {
  if (memoryWidths) return memoryWidths;
  try {
    memoryWidths = parseLeadTableColumnWidths(
      storage?.getItem(LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY) ?? null,
    );
  } catch {
    memoryWidths = {};
  }
  return memoryWidths;
}

export function writeLeadTableColumnWidths(
  widths: Record<string, number>,
  storage?: Pick<Storage, "setItem"> | null,
): Record<string, number> {
  const clean = parseLeadTableColumnWidths(JSON.stringify(widths));
  memoryWidths = { ...(memoryWidths ?? {}), ...clean };
  try {
    storage?.setItem(
      LEAD_TABLE_COLUMN_WIDTHS_STORAGE_KEY,
      JSON.stringify(memoryWidths),
    );
  } catch {
    // Private mode or a full quota should not block resizing.
  }
  return memoryWidths;
}

export function applyLeadTableColumnWidths<
  T extends { id: string; width: number },
>(columns: T[], saved: Record<string, number>): T[] {
  return columns.map((column) => {
    const width = saved[column.id];
    return width ? { ...column, width } : column;
  });
}

export function getLeadTableCustomColumns<
  T extends {
    field_key: string;
    field_label: string;
    field_type: string;
    sort_order?: number;
  },
>(
  fields: T[],
  systemFieldKeys: ReadonlySet<string>,
): Array<T & { visibilityKey: string }> {
  return fields
    .filter(
      (field) =>
        !systemFieldKeys.has(field.field_key) &&
        !isLeadTableColumnPreferenceKey(field.field_key),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((field) => ({
      ...field,
      visibilityKey: `${LEAD_TABLE_COLUMN_PREF_PREFIX}${field.field_key}`,
    }));
}

export function formatLeadTableFieldValue(
  value: unknown,
  type = "text",
): string {
  if (value == null || value === "") return "—";
  if (type === "checkbox") {
    return value === true || value === "true" ? "כן" : "לא";
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (type === "date" && date) return `${date[3]}/${date[2]}/${date[1]}`;
    if (value.startsWith("[")) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean).join(", ") || "—";
        }
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join(", ") || "—";
  }
  return "—";
}

export function formatLeadFilesColumn(lead: {
  attachments?: unknown;
  folder_links?: unknown;
  folder_link?: string | null;
}): string {
  const attachments = Array.isArray(lead.attachments)
    ? lead.attachments.length
    : 0;
  const links = Array.isArray(lead.folder_links) ? lead.folder_links.length : 0;
  const folder = lead.folder_link?.trim() ? 1 : 0;
  const total = attachments + links + folder;
  if (!total) return "—";
  return total === 1 ? "קובץ אחד" : `${total} קבצים`;
}

export function readLeadCustomColumnValue(
  formData: unknown,
  fieldKey: string,
): unknown {
  if (!formData || typeof formData !== "object" || Array.isArray(formData)) {
    return null;
  }
  return (formData as Record<string, unknown>)[fieldKey];
}
