/** A lead as the landing-pages app sends it. */
export interface LandingLead {
  subdomain: string;
  slug: string;
  name: string;
  phone: string;
  email: string | null;
  /** The form's optional answers (landing-pages `form.fields`); null when the form did not ask. */
  company: string | null;
  employees: string | null;
}

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const PHONE = /^[0-9+()\-\s]{9,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates an untrusted request body; null when any field is missing or malformed. */
export function parseLandingLead(body: unknown): LandingLead | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const { subdomain, slug, name, phone, email, company, employees } =
    body as Record<string, unknown>;
  if (typeof subdomain !== "string" || !SUBDOMAIN.test(subdomain)) {
    return null;
  }
  if (typeof slug !== "string" || !SLUG.test(slug)) {
    return null;
  }
  if (typeof name !== "string" || typeof phone !== "string") {
    return null;
  }

  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  if (
    cleanName.length < 2 ||
    cleanName.length > 80 ||
    !PHONE.test(cleanPhone)
  ) {
    return null;
  }

  const extra = {
    company: optionalText(company, 120),
    employees: optionalText(employees, 40),
  };
  if (extra.company === undefined || extra.employees === undefined) {
    return null;
  }
  const base = { subdomain, slug, name: cleanName, phone: cleanPhone };
  if (email === undefined || email === null || email === "") {
    return { ...base, email: null, ...extra };
  }
  if (typeof email !== "string" || email.length > 120 || !EMAIL.test(email)) {
    return null;
  }
  return { ...base, email, ...extra };
}

/** An optional answer: null when absent or blank, undefined (invalid) when not short text. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const clean = value.trim();
  if (clean.length > max) {
    return undefined;
  }
  return clean || null;
}
