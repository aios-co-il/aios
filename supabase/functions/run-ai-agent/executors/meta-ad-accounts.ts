import { FB_GRAPH_VERSION } from "./meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";

/** All ad accounts the token can see (id without act_ prefix + name). Null on failure. */
export async function fbListAccessibleAdAccounts(
  token: string,
): Promise<Array<{ id: string; name: string; status: number | null }> | null> {
  try {
    const url = `https://graph.facebook.com/${FB_GRAPH_VERSION}/me/adaccounts?fields=account_id,name,account_status&limit=500&access_token=${token}`;
    const r = await fetch(url);
    const res = await readMetaResponse(r);
    const j = res.ok ? res.value : null;
    if (!r.ok || j?.error || !Array.isArray(j?.data)) {
      return null;
    }
    return j.data
      .map((a) => ({
        id: String(a.account_id || a.id || "").replace(/^act_/, ""),
        name: String(a.name || ""),
        status: a.account_status != null ? Number(a.account_status) : null,
      }))
      .filter((a) => a.id);
  } catch {
    return null;
  }
}
