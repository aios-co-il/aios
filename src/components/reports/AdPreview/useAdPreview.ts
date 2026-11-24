import { skipToken, useQuery } from "@tanstack/react-query";
import {
  type AdPreviewRequest,
  previewSrcOf,
} from "@functions/ad-preview/contract.ts";
import { supabase } from "@/integrations/supabase/client";
import type { AdPreviewSource } from "./AdPreviewContext";

// Meta signs the preview address for a limited time, so a reopened dialog
// within a few minutes reuses it and a later one asks again.
const PREVIEW_STALE_MS = 5 * 60 * 1000;

/**
 * Meta's preview iframe address for one ad, read through ad-preview while
 * adId is set (the dialog is open). The token never leaves the server.
 */
export function useAdPreview(source: AdPreviewSource, adId: string | null) {
  return useQuery({
    queryKey: ["ad-preview", source, adId],
    queryFn: adId
      ? () => fetchAdPreviewSrc(requestOf(source, adId))
      : skipToken,
    staleTime: PREVIEW_STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** The ad-preview body for this source. */
function requestOf(source: AdPreviewSource, adId: string): AdPreviewRequest {
  return "shareToken" in source
    ? { ad_id: adId, share_token: source.shareToken }
    : { ad_id: adId, table_id: source.tableId };
}

/** Asks ad-preview for the address; throws when it refuses or answers without one. */
async function fetchAdPreviewSrc(body: AdPreviewRequest): Promise<string> {
  const { data, error } = await supabase.functions.invoke("ad-preview", {
    body,
  });
  if (error) {
    console.error("[ad-preview] request failed", error);
    throw error;
  }
  const src = previewSrcOf(data);
  if (!src) {
    console.error("[ad-preview] answer without a Meta preview address", data);
    throw new Error("ad-preview answered without a preview address");
  }
  return src;
}
