export interface DiscoveredForm {
  form_id: string;
  form_name: string;
  total: number;
  last_30_days: number;
  sources: Record<string, number>;
  slugs?: string[];
  sample_referer?: string | null;
}

export interface DiscoveredSlug {
  slug: string;
  submissions: number;
  google_ads_submissions: number;
  sample_gad_campaignids: string[];
}

export interface ElementorDiscovery {
  per_form: DiscoveredForm[];
  per_slug: DiscoveredSlug[];
}

type UnknownRecord = { [key: string]: unknown };

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : "";

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const textList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item: unknown) => {
        const s = text(item);
        return s ? [s] : [];
      })
    : [];

function parseSources(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, n]) =>
      typeof n === "number" ? [[key, n]] : [],
    ),
  );
}

function parseForm(value: unknown): DiscoveredForm[] {
  if (!isRecord(value)) return [];
  return [
    {
      form_id: text(value.form_id),
      form_name: text(value.form_name),
      total: count(value.total),
      last_30_days: count(value.last_30_days),
      sources: parseSources(value.sources),
      slugs: Array.isArray(value.slugs) ? textList(value.slugs) : undefined,
      sample_referer:
        typeof value.sample_referer === "string" ? value.sample_referer : null,
    },
  ];
}

function parseSlug(value: unknown): DiscoveredSlug[] {
  if (!isRecord(value)) return [];
  return [
    {
      slug: text(value.slug),
      submissions: count(value.submissions),
      google_ads_submissions: count(value.google_ads_submissions),
      sample_gad_campaignids: textList(value.sample_gad_campaignids),
    },
  ];
}

/** Narrows the `fetch-elementor-submissions` response; non-object entries are dropped. */
export function parseElementorDiscovery(data: unknown): ElementorDiscovery {
  const body = isRecord(data) ? data : {};
  return {
    per_form: Array.isArray(body.per_form)
      ? body.per_form.flatMap(parseForm)
      : [],
    per_slug: Array.isArray(body.per_slug)
      ? body.per_slug.flatMap(parseSlug)
      : [],
  };
}
