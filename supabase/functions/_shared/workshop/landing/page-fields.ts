/** Readers for the fields of a landing page section: each trims, checks and reports. */
import {
  LANDING_FORM_FIELDS,
  type LandingCard,
  type LandingForm,
  type LandingFormField,
} from "./page-content.ts";

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
  const at = `${where}.form`;
  const fields = formFields(raw.fields, at, problems);
  return {
    buttonLabel: text(raw, "buttonLabel", 60, at, problems),
    successMessage: text(raw, "successMessage", 300, at, problems),
    ...(fields.length > 0 ? { fields } : {}),
  };
}

/** The form's extra fields: none, or names from LANDING_FORM_FIELDS, each once. */
function formFields(
  raw: unknown,
  where: string,
  problems: Array<string>,
): Array<LandingFormField> {
  if (raw === undefined || raw === null) {
    return [];
  }
  const list = Array.isArray(raw) ? raw : [raw];
  const known = list.filter((field): field is LandingFormField =>
    (LANDING_FORM_FIELDS as ReadonlyArray<unknown>).includes(field),
  );
  if (known.length !== list.length) {
    problems.push(`${where}: fields מקבל רק ${LANDING_FORM_FIELDS.join(", ")}`);
  }
  return [...new Set(known)];
}

/**
 * An optional list of short lines under `key`: none, or 1 to `max` lines of up to `itemMax`
 * characters. Lines that are not text are reported.
 */
export function lines(
  source: Record<string, unknown>,
  key: string,
  limits: { max: number; itemMax: number },
  where: string,
  problems: Array<string>,
): Array<string> {
  const raw = source[key];
  if (raw === undefined || raw === null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    problems.push(`${where}: ${key} חייב להיות רשימה`);
    return [];
  }
  if (raw.length > limits.max) {
    problems.push(`${where}: ${key}: יותר מ-${limits.max} שורות`);
  }
  return raw
    .slice(0, limits.max)
    .map((line, index) =>
      text(
        { line },
        "line",
        limits.itemMax,
        `${where}.${key}.${index + 1}`,
        problems,
      ),
    )
    .filter(Boolean);
}

/** One card: plain text is a title alone; an object has a title and an optional explanation. */
export function card(
  raw: unknown,
  titleMax: number,
  where: string,
  problems: Array<string>,
): string | LandingCard {
  if (typeof raw === "string") {
    return text({ title: raw }, "title", titleMax, where, problems);
  }
  const entry = record(raw);
  const body = text(entry, "body", 300, where, problems, false);
  return {
    title: text(entry, "title", titleMax, where, problems),
    ...(body ? { body } : {}),
  };
}

/** An optional field: present only when it has text. */
export function optional<K extends string>(key: K, value: string) {
  return (value ? { [key]: value } : {}) as { [P in K]?: string };
}
