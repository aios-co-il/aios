import {
  buildTemplateVars,
  type TemplateVars,
} from "../../../supabase/functions/_shared/broadcast-template.ts";

export const SAMPLE_VARS: TemplateVars = buildTemplateVars({
  contact_name: "ישראל ישראלי",
  company_name: "חברה לדוגמה בע״מ",
  email: "israel@example.com",
  phone: "972501234567",
  agency_name: "הסוכנות שלי",
  campaigner_name: "דנה כהן",
  lead_stage: "פגישה נקבעה",
  lead_status: "חם",
  client_status: "פעיל",
});

export function formatBytes(n?: number) {
  if (!n) return "";
  return n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)}MB`
    : `${Math.ceil(n / 1024)}KB`;
}

/** The `message` of a thrown value, or "" when it has none. */
export function errorMessage(e: unknown): string {
  if (typeof e === "object" && e !== null && "message" in e) {
    const { message } = e;
    return typeof message === "string" ? message : "";
  }
  return "";
}

/** Replace the input's selection with `token` and move the caret after it. */
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
  set: (v: string) => void,
  token: string,
) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  set(value.slice(0, start) + token + value.slice(end));
  requestAnimationFrame(() => {
    el?.focus();
    el?.setSelectionRange(start + token.length, start + token.length);
  });
}
