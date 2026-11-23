import { readMetaResponse } from "../meta-response.ts";
import { FB_GRAPH_VERSION } from "./meta-api-version.ts";

/** Preserves the existing campaign insights calculation/read. */
export async function fetchCampaignInsights(
  token: string,
  campaignId: string,
  fields: string,
  date_preset: string,
) {
  const r = await fetch(
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${campaignId}/insights?fields=${fields}&date_preset=${date_preset}&access_token=${token}`,
  );
  const res = await readMetaResponse(r);
  return (res.ok && res.value.data?.[0]) || null;
}
