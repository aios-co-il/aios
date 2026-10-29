import { assertStrictEquals } from "jsr:@std/assert@1";
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

Deno.test("propagate sends the same eq/neq filters as before", async () => {
  const { client, requests } = recordingClient();
  await propagateWhatsappGroupInviteLink(client, GROUP, ` ${LINK} `);
  assertStrictEquals(requests.length, 1);
  const [patch] = requests;
  assertStrictEquals(patch.method, "PATCH");
  assertStrictEquals(patch.path, "/rest/v1/whatsapp_groups");
  assertStrictEquals(patch.params.get("group_chat_id"), `eq.${GROUP}`);
  assertStrictEquals(patch.params.get("invite_link"), `neq.${LINK}`);
});

Deno.test("propagate skips empty links", async () => {
  const { client, requests } = recordingClient();
  await propagateWhatsappGroupInviteLink(client, GROUP, "  ");
  assertStrictEquals(requests.length, 0);
});

Deno.test("resolve copies a sibling link and propagates it", async () => {
  const { client, requests } = recordingClient([{ invite_link: ` ${LINK} ` }]);
  assertStrictEquals(
    await resolveWhatsappGroupInviteLink(client, GROUP, null),
    LINK,
  );
  const [select, patch] = requests;
  assertStrictEquals(select.method, "GET");
  assertStrictEquals(select.params.get("group_chat_id"), `eq.${GROUP}`);
  assertStrictEquals(select.params.get("invite_link"), "not.is.null");
  assertStrictEquals(select.params.get("limit"), "1");
  assertStrictEquals(patch.params.get("invite_link"), `neq.${LINK}`);
});

Deno.test("resolve prefers the cached link", async () => {
  const { client, requests } = recordingClient();
  assertStrictEquals(
    await resolveWhatsappGroupInviteLink(client, GROUP, LINK),
    LINK,
  );
  assertStrictEquals(requests.length, 0);
});
