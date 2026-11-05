import { assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { quoteProduction } from "./produce-video-quote.ts";
import { startProduction } from "./produce-video-start.ts";
import { fakeDb, scene } from "./test-fakes.ts";

/** Starts a gated mock production on a client whose produce_video answers `state`. */
async function start(state: Record<string, unknown>) {
  const db = fakeDb({
    "marketing_assets:select": [],
    "rpc:produce_video": state,
  });
  const ctx: ToolContext = {
    supabase: db,
    tenantId: "tenant-1",
    name: "workshop_produce_video",
    args: {},
    assertClientAccess: async () => {},
    userId: null,
    deps: {},
  };
  const scenes = [scene("s-1")];
  const payload = { project_type: "video", video: { voice_id: "v" } };
  const quote = await quoteProduction(ctx, {
    itemId: "item-1",
    payload,
    video: payload.video,
    scenes,
    engine: "mock",
    animated: scenes,
    relip: [],
  });
  const reply = await startProduction(ctx, {
    itemId: "item-1",
    title: "חג שמח",
    payload,
    engine: "mock",
    keepDesign: false,
    stageId: "stage-1",
    clientId: "client-1",
    redrawnSceneIds: [],
    quote,
  });
  return { db, reply: reply as Record<string, unknown> };
}

describe("startProduction", () => {
  it("saves the settings, queues the production and opens its film page", async () => {
    const { db, reply } = await start({ status: "running", clips: 1 });
    assertStrictEquals(reply.started, true);
    assertStrictEquals(reply.client_id, "client-1");
    assertStrictEquals(
      db.calls.some(
        (call) => call.table === "workshop_artifacts" && call.op === "insert",
      ),
      true,
    );
  });

  it("opens no film page for a production that failed at once", async () => {
    const { db, reply } = await start({ status: "failed", error: "no key" });
    assertStrictEquals(reply.status, "failed");
    assertStrictEquals(reply.error, "no key");
    assertStrictEquals(
      db.calls.some((call) => call.table === "workshop_artifacts"),
      false,
    );
  });
});
