import { z } from "zod";

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

/** Text, or a number as text; anything else reads as "". */
const text = z.union([z.string(), z.number().transform(String)]).catch("");

const count = z.number().finite().catch(0);

const textList = z.array(z.unknown()).transform((items) =>
  items.flatMap((item) => {
    const value = text.parse(item);
    return value ? [value] : [];
  }),
);

const sourcesSchema = z
  .record(z.unknown())
  .catch({})
  .transform((value) =>
    Object.fromEntries(
      Object.entries(value).flatMap(([key, n]): [string, number][] => {
        const parsed = z.number().safeParse(n);
        return parsed.success ? [[key, parsed.data]] : [];
      }),
    ),
  );

const discoveredFormSchema = z.object({
  form_id: text,
  form_name: text,
  total: count,
  last_30_days: count,
  sources: sourcesSchema,
  slugs: textList.optional().catch(undefined),
  sample_referer: z.string().nullable().catch(null),
});

const discoveredSlugSchema = z.object({
  slug: text,
  submissions: count,
  google_ads_submissions: count,
  sample_gad_campaignids: textList.catch([]),
});

const objectList = <S extends z.ZodTypeAny>(schema: S) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item): z.output<S>[] => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    );

const elementorDiscoverySchema = z
  .object({
    per_form: objectList(discoveredFormSchema),
    per_slug: objectList(discoveredSlugSchema),
  })
  .catch({ per_form: [], per_slug: [] });

/** Narrows the `fetch-elementor-submissions` response; non-object entries are dropped. */
export function parseElementorDiscovery(data: unknown): ElementorDiscovery {
  return elementorDiscoverySchema.parse(data);
}
