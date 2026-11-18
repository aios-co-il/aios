/** Readers for the fields of a landing page section: each trims, checks and reports. */
import type { LandingForm } from "./page-content.ts";

/** Reads one section field as trimmed text and reports it when missing or too long. */
export function text(
  source: Record<string, unknown>,
  key: string,
  max: number,
  where: string,
  problems: Array<string>,
  required = true,
): string {
  const raw = source[key];
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    problems.push(`${where}: ${key} חייב להיות טקסט`);
    return "";
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value && required) {
    problems.push(`${where}: חסר ${key}`);
  }
  if (value.length > max) {
    problems.push(`${where}: ${key} ארוך מ-${max} תווים`);
  }
  return value;
}

/** A plain object, or an empty one for anything else. */
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads a section's item list and reports it when empty or over its limit. */
export function items(
  source: Record<string, unknown>,
  max: number,
  where: string,
  problems: Array<string>,
): Array<unknown> {
  const list = Array.isArray(source.items) ? source.items : [];
  if (list.length === 0) {
    problems.push(`${where}: items ריק`);
  }
  if (list.length > max) {
    problems.push(`${where}: יותר מ-${max} פריטים`);
  }
  return list.slice(0, max);
}

/** Reads a section's lead form. */
export function form(
  source: Record<string, unknown>,
  where: string,
  problems: Array<string>,
): LandingForm {
  const raw = record(source.form);
  return {
    buttonLabel: text(raw, "buttonLabel", 60, `${where}.form`, problems),
    successMessage: text(raw, "successMessage", 300, `${where}.form`, problems),
  };
}

/** An optional field: present only when it has text. */
export function optional<K extends string>(key: K, value: string) {
  return (value ? { [key]: value } : {}) as { [P in K]?: string };
}
