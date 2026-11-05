/**
 * The film's brand from the work item payload: the same fields the Creative brand kit
 * writes (brand_book.colors, brand_book.fonts, logo_url or brand_book.logoUrl,
 * client_website). Returns null when the payload carries no brand at all.
 */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FONT = /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/;

const record = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const text = (value, max) =>
  typeof value === "string" && value.trim()
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : null;

export const brandColor = (value) =>
  typeof value === "string" && HEX.test(value.trim()) ? value.trim() : null;

export const brandFont = (value) =>
  typeof value === "string" && FONT.test(value.trim()) ? value.trim() : null;

/** A display form of the website: no scheme, no trailing slash. */
const displayUrl = (value) => {
  const raw = text(value, 120);
  if (!raw) return null;
  return raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || null;
};

/**
 * The brand's name on the work item (brand_book.name, brand_name or client_name), for the key
 * words of motion captions; null when none is set.
 */
export function brandNameFromPayload(payload) {
  const data = record(payload);
  const book = record(data.brand_book);
  return (
    text(book.name, 60) ??
    text(book.brand_name, 60) ??
    text(data.brand_name, 60) ??
    text(data.client_name, 60)
  );
}

export function brandFromPayload(payload) {
  const data = record(payload);
  const book = record(data.brand_book);
  const colors = (Array.isArray(book.colors) ? book.colors : [])
    .map(brandColor)
    .filter(Boolean);
  const fonts = Array.isArray(book.fonts) ? book.fonts : [];
  const brand = {
    primaryColor: colors[0] ?? null,
    secondaryColor: colors[1] ?? null,
    logoUrl: text(data.logo_url, 2000) ?? text(book.logoUrl, 2000),
    fontFamily: fonts.map(brandFont).find(Boolean) ?? null,
    ctaText: text(data.cta_text ?? data.cta ?? book.cta, 120),
    ctaUrl: displayUrl(data.client_website ?? book.website),
  };
  if (!Object.values(brand).some(Boolean)) return null;
  // The user chose an ending without a closing card (workshop brief "סיום: בלי סגיר").
  return data.end_card === false ? { ...brand, endCard: false } : brand;
}
