// Pure helpers shared by the broadcast edge functions, the automation engine
// and the frontend (template editor preview). No Deno / browser APIs here.

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

/**
 * Minimal server-side clean-up of tenant-authored email HTML. The editor
 * already sanitizes with DOMPurify; this is a second line of defence for
 * HTML that reaches the API another way.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(
      /<\s*(script|style|iframe|object|embed|form|meta|link)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|form|meta|link)\b[^>]*\/?>/gi,
      "",
    )
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi,
      '$1="#"',
    );
}

/**
 * Clean-up for ready-made email HTML (html_mode). Keeps <style>, <head>,
 * <meta> and tables so designed emails render as built; removes only what
 * can run code.
 */
export function sanitizeRawEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(
      /<\s*(script|iframe|object|embed|form)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src)\s*=\s*("|')\s*(javascript|vbscript):[^"']*\2/gi,
      '$1="#"',
    );
}

/** Put a footer before </body> when the HTML is a full document, else append. */
export function injectBeforeBodyEnd(html: string, footer: string): string {
  const idx = html.search(/<\/body\s*>/i);
  return idx === -1
    ? html + footer
    : html.slice(0, idx) + footer + html.slice(idx);
}

/** Plain text → simple RTL HTML (escape + line breaks). */
export function textToEmailHtml(body: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222" dir="rtl">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`;
}

/** Wrap rich editor HTML in the same RTL container as plain text emails. */
export function wrapEmailHtml(innerHtml: string): string {
  // Editor images keep their size but never overflow narrow (mobile) clients.
  const body = innerHtml.replace(
    /<img\b(?![^>]*\sstyle=)/gi,
    '<img style="max-width:100%;height:auto"',
  );
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222" dir="rtl">${body}</div>`;
}

/** Strip tags for the plain-text alternative of an HTML email. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Final email HTML + plain-text alternative for one recipient.
 * - htmlMode: ready-made HTML, sent as-is (scripts stripped), footer before </body>.
 * - bodyHtml: rich-editor HTML, wrapped in the default RTL container.
 * - otherwise: plain text body.
 */
export function buildEmailContent(opts: {
  bodyHtml?: string | null;
  bodyText?: string | null;
  htmlMode?: boolean | null;
  vars: TemplateVars;
  footerHtml?: string;
}): { html: string; text: string } {
  const footer = opts.footerHtml ?? "";
  const text = renderTemplate(opts.bodyText || "", opts.vars);
  if (opts.bodyHtml && opts.htmlMode) {
    const html = renderTemplate(
      sanitizeRawEmailHtml(opts.bodyHtml),
      opts.vars,
      {
        html: true,
      },
    );
    return {
      html: injectBeforeBodyEnd(html, footer),
      text: text || htmlToText(html),
    };
  }
  if (opts.bodyHtml) {
    const html = renderTemplate(sanitizeEmailHtml(opts.bodyHtml), opts.vars, {
      html: true,
    });
    return {
      html: wrapEmailHtml(html) + footer,
      text: text || htmlToText(html),
    };
  }
  return { html: textToEmailHtml(text) + footer, text };
}

/** An attachment stored on a template/broadcast (`attachments` jsonb). */
export interface EmailAttachment {
  name: string;
  path?: string;
  url: string;
  size?: number;
  content_type?: string;
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Public URL prefix of the bucket attachments must come from. */
export function attachmentUrlPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/broadcast-media/`;
}

/** Stored attachments → Resend `{filename, path}` items. Drops anything
 * malformed or not served from our broadcast-media bucket, so a crafted row
 * cannot make Resend fetch an arbitrary URL. */
export function emailAttachmentsForResend(
  list: unknown,
  allowedUrlPrefix: string,
): { filename: string; path: string }[] {
  if (!Array.isArray(list)) return [];
  const out: { filename: string; path: string }[] = [];
  for (const item of list) {
    const a = item as Partial<EmailAttachment> | null;
    const url = typeof a?.url === "string" ? a.url : "";
    const name = typeof a?.name === "string" ? a.name.trim() : "";
    if (!url || !name || !url.startsWith(allowedUrlPrefix)) continue;
    out.push({ filename: name.slice(0, 200), path: url });
  }
  return out;
}
