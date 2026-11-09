import type { MetaLeadForm } from "./meta-lead-types.ts";
import type { MetaLeadPage } from "./meta-lead-types.ts";
import { FB_GRAPH_VERSION } from "../executors/meta-api-version.ts";
import { readMetaResponse } from "../meta-response.ts";

/** Preserves the existing metaLeadFormsForPage behavior at its extracted boundary. */
export async function metaLeadFormsForPage(
  page: MetaLeadPage,
): Promise<Array<MetaLeadForm>> {
  const forms: Array<MetaLeadForm> = [];
  let next: string | null =
    `https://graph.facebook.com/${FB_GRAPH_VERSION}/${page.id}/leadgen_forms?fields=id,name,status,questions&limit=100&access_token=${encodeURIComponent(page.access_token)}`;
  while (next) {
    const response = await fetch(next);
    const result = await readMetaResponse(response);
    if (!result.ok) {
      throw new Error(
        String(
          result.error.message ?? `Meta forms request failed for ${page.name}`,
        ),
      );
    }
    const json = result.value;
    if (!response.ok || json.error) {
      throw new Error(
        json.error?.message || `Meta forms request failed for ${page.name}`,
      );
    }
    for (const form of json.data || []) {
      forms.push({
        id: String(form.id),
        name: String(form.name || form.id),
        status: form.status ? String(form.status) : null,
        fields: (form.questions || []).map((q) => ({
          key: String(q.key || q.type || ""),
          label: String(q.label || q.key || q.type || ""),
          type: String(q.type || ""),
        })),
        page_id: page.id,
        page_name: page.name,
        integration_id: page.integration_id,
      });
    }
    next = json.paging?.next || null;
  }
  return forms;
}
