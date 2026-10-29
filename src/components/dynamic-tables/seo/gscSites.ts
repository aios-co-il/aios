import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { parseEach } from "@/lib/jsonReaders";

const gscSiteSchema = z.object({
  siteUrl: z.string(),
  permissionLevel: z.string().optional().catch(undefined),
});

export type GscSite = z.infer<typeof gscSiteSchema>;

/** GSC site list from `available_sites` settings or a `gsc-list-sites` body. */
export const toGscSites = (value: Json | undefined): GscSite[] =>
  parseEach(gscSiteSchema, value);
