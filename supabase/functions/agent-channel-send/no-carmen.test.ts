import { assertEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import { channelHealthBanner } from "../../../src/lib/agentChannelRouting.ts";
import { noCarmenReply } from "./no-carmen.ts";

describe("noCarmenReply", () => {
  it("answers list_routes with no brains, restricted, instead of a 400", () => {
    assertEquals(noCarmenReply("list_routes"), {
      status: 200,
      body: { ok: true, routes: [], restricted: true, no_carmen: true },
    });
  });

  it("answers channel_health with a reply the chat bar shows no banner for", () => {
    const reply = noCarmenReply("channel_health");

    assertEquals(reply.status, 200);
    assertEquals(channelHealthBanner(reply.body), null);
  });

  it("keeps a 400 for actions that need Carmen", () => {
    for (const action of ["send", "select_route", "persist_assistant"]) {
      assertEquals(noCarmenReply(action).status, 400);
    }
  });
});
