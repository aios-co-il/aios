import type { Json } from "@/integrations/supabase/types";
import { isJsonObject } from "@/lib/jsonReaders";

export type GscSite = {
  siteUrl: string;
  permissionLevel?: string;
};

/** GSC site list from `available_sites` settings or a `gsc-list-sites` body. */
export const toGscSites = (value: Json | undefined): GscSite[] =>
  Array.isArray(value)
    ? value.flatMap((site) =>
        isJsonObject(site) && typeof site.siteUrl === "string"
          ? [
              {
                siteUrl: site.siteUrl,
                permissionLevel:
                  typeof site.permissionLevel === "string"
                    ? site.permissionLevel
                    : undefined,
              },
            ]
          : [],
      )
    : [];
