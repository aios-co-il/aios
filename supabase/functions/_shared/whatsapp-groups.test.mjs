import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  propagateWhatsappGroupInviteLink,
  resolveWhatsappGroupInviteLink,
} from "./whatsapp-groups.ts";

const GROUP = "120363@g.us";
const LINK = "https://chat.whatsapp.com/abc";

function recordingClient(selectRows = []) {
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    requests.push({ method, path: url.pathname, params: url.searchParams });
    return method === "GET"
      ? new Response(JSON.stringify(selectRows), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      : new Response(null, { status: 204 });
  };
  const client = createClient("https://example.supabase.co", "anon-key", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, requests };
}

test("propagate sends the same eq/neq filters as before", async () => {
  const { client, requests } = recordingClient();
  await propagateWhatsappGroupInviteLink(client, GROUP, ` ${LINK} `);
  assert.equal(requests.length, 1);
  const [patch] = requests;
  assert.equal(patch.method, "PATCH");
  assert.equal(patch.path, "/rest/v1/whatsapp_groups");
  assert.equal(patch.params.get("group_chat_id"), `eq.${GROUP}`);
  assert.equal(patch.params.get("invite_link"), `neq.${LINK}`);
});

test("propagate skips empty links", async () => {
  const { client, requests } = recordingClient();
  await propagateWhatsappGroupInviteLink(client, GROUP, "  ");
  assert.equal(requests.length, 0);
});

test("resolve copies a sibling link and propagates it", async () => {
  const { client, requests } = recordingClient([{ invite_link: ` ${LINK} ` }]);
  assert.equal(await resolveWhatsappGroupInviteLink(client, GROUP, null), LINK);
  const [select, patch] = requests;
  assert.equal(select.method, "GET");
  assert.equal(select.params.get("group_chat_id"), `eq.${GROUP}`);
  assert.equal(select.params.get("invite_link"), "not.is.null");
  assert.equal(select.params.get("limit"), "1");
  assert.equal(patch.params.get("invite_link"), `neq.${LINK}`);
});

test("resolve prefers the cached link", async () => {
  const { client, requests } = recordingClient();
  assert.equal(await resolveWhatsappGroupInviteLink(client, GROUP, LINK), LINK);
  assert.equal(requests.length, 0);
});
