// Merge fields and {{field}} rendering for broadcast templates. Pure: no
// Deno / browser APIs (shared by edge functions and the frontend).

export type TemplateVars = Record<string, string>;

/** Merge fields every recipient can have. Custom list/file columns come on top. */
export const STANDARD_TEMPLATE_FIELDS: { key: string; label: string }[] = [
  { key: "contact_name", label: "שם איש קשר" },
  { key: "first_name", label: "שם פרטי" },
  { key: "company_name", label: "שם חברה / לקוח" },
  { key: "email", label: "אימייל" },
  { key: "phone", label: "טלפון" },
  { key: "agency_name", label: "סוכנות" },
  { key: "campaigner_name", label: "קמפיינר" },
  { key: "sales_person_name", label: "איש מכירות" },
  { key: "lead_stage", label: "שלב במשפך" },
  { key: "lead_status", label: "סטטוס ליד" },
  { key: "client_status", label: "סטטוס לקוח" },
];

export function normalizePhone(
  input: string | number | null | undefined,
  cc = "972",
): string | null {
  if (input === null || input === undefined) return null;
  let d = String(input).replace(/[^0-9]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith(cc)) return d;
  if (d.startsWith("0")) return cc + d.slice(1);
  return cc + d;
}

/** Turn a file/sheet header into a merge-field key: trimmed, spaces → "_". */
export function fieldKeyFromHeader(header: string): string {
  return String(header ?? "")
    .trim()
    .replace(/[{}|]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

const toStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
};

/**
 * Build the merge-field map for one recipient. Later sources win:
 * extra (form_data / custom_fields) < standard fields, so a stray custom
 * column named "email" cannot override the real address.
 */
export function buildTemplateVars(input: {
  contact_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  agency_name?: string | null;
  campaigner_name?: string | null;
  sales_person_name?: string | null;
  lead_stage?: string | null;
  lead_status?: string | null;
  client_status?: string | null;
  extra?: Record<string, unknown> | null;
}): TemplateVars {
  const vars: TemplateVars = {};
  for (const [k, v] of Object.entries(input.extra || {})) {
    const s = toStr(v);
    const key = fieldKeyFromHeader(k);
    if (s !== null && key) vars[key] = s;
  }
  const contact = toStr(input.contact_name) ?? toStr(input.company_name);
  const std: Record<string, string | null> = {
    contact_name: contact,
    name: contact,
    first_name: contact ? contact.split(/\s+/)[0] : null,
    company_name: toStr(input.company_name),
    email: toStr(input.email),
    phone: toStr(input.phone),
    agency_name: toStr(input.agency_name),
    campaigner_name: toStr(input.campaigner_name),
    sales_person_name: toStr(input.sales_person_name),
    lead_stage: toStr(input.lead_stage),
    lead_status: toStr(input.lead_status),
    client_status: toStr(input.client_status),
  };
  for (const [k, v] of Object.entries(std)) if (v !== null) vars[k] = v;
  return vars;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FIELD_RE = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

/**
 * Replace {{field}} and {{field|fallback}}. Unknown fields without a fallback
 * become empty. With html=true, values (not the template) are HTML-escaped.
 */
export function renderTemplate(
  template: string | null | undefined,
  vars: TemplateVars,
  opts: { html?: boolean } = {},
): string {
  if (!template) return "";
  const lookup = new Map<string, string>();
  for (const [k, v] of Object.entries(vars || {}))
    lookup.set(k.toLowerCase(), v);
  return template.replace(FIELD_RE, (_m, rawKey: string, fallback?: string) => {
    const key = fieldKeyFromHeader(rawKey);
    const value = lookup.get(key) ?? lookup.get(rawKey.trim().toLowerCase());
    const out = value !== undefined && value !== "" ? value : (fallback ?? "");
    return opts.html ? escapeHtml(out) : out;
  });
}

/** Field keys a template references (for the editor's "missing field" hint). */
export function templateFieldKeys(
  template: string | null | undefined,
): string[] {
  if (!template) return [];
  const keys = new Set<string>();
  for (const m of template.matchAll(FIELD_RE))
    keys.add(fieldKeyFromHeader(m[1]));
  return [...keys];
}
