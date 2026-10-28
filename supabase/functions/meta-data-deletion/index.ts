// Meta "Data Deletion Request Callback".
// POST (form field `signed_request`): verify the HMAC-SHA256 signature with the
// app secret, log the request in meta_data_deletion_requests and answer with the
// status URL + confirmation code Meta expects.
// GET ?code=<confirmation_code>: return the stored status for the /data-deletion page.
//
// Note: facebook-auth stores only the user token and the page list in
// tenant_integrations; no Facebook user id is persisted, so there is no row to
// match against `user_id` from the signed request. Tokens are revoked by Meta
// when the app is removed; the logged request is processed manually (see
// /data-deletion and the privacy email).

import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { readDeletionRequestStatus } from "./contract.ts";
import {
  type DeletionRequestStore,
  type MetaDataDeletionDeps,
  handleMetaDataDeletion,
} from "./handler.ts";

// Same convention as google-*-auth and trigger-automation: APP_URL is the
// per-environment site origin; production is the fallback.
const APP_BASE = (Deno.env.get("APP_URL") || "https://aios.co.il").replace(
  /\/+$/,
  "",
);
const STATUS_PAGE = `${APP_BASE}/data-deletion`;

function supabaseStore(supabase: DbClient): DeletionRequestStore {
  return {
    async findByCode(code) {
      const { data, error } = await supabase
        .from("meta_data_deletion_requests")
        .select("confirmation_code, status, created_at")
        .eq("confirmation_code", code)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = readDeletionRequestStatus(data);
      if (!row) throw new Error(`Unexpected deletion status: ${data.status}`);
      return row;
    },
    async insert(row) {
      const { error } = await supabase
        .from("meta_data_deletion_requests")
        .insert(row);
      if (error) throw error;
    },
  };
}

const deps: MetaDataDeletionDeps = {
  store: supabaseStore(serviceClient()),
  appSecret:
    Deno.env.get("FACEBOOK_APP_SECRET") ?? Deno.env.get("META_APP_SECRET"),
  statusPage: STATUS_PAGE,
};

Deno.serve((req) => handleMetaDataDeletion(req, deps));
