import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { linkStage, runningReply } from "./produce-video-stage.ts";
import { fakeDb } from "./test-fakes.ts";

/** A context on `db` whose client access check refuses `refused`. */
const ctx = (
  db: ReturnType<typeof fakeDb>,
  args: Record<string, unknown> = {},
  refused = "",
): ToolContext => ({
  supabase: db,
  tenantId: "tenant-1",
  name: "workshop_produce_video",
  args,
  assertClientAccess: async (clientId) => {
    if (clientId === refused) {
      throw new Error("אין גישה ללקוח");
    }
  },
  userId: null,
  deps: {},
});

describe("linkStage", () => {
  it("keeps a project that already has a stage as it is", async () => {
    const db = fakeDb();
    const linked = await linkStage(ctx(db), "item-1", {
      stage_id: "stage-1",
      client_id: "client-1",
    });
    assertEquals(linked, { stageId: "stage-1", clientId: "client-1" });
    assertStrictEquals(db.calls.length, 0);
  });

  it("refuses a client the caller cannot reach", async () => {
    const linked = await linkStage(
      ctx(fakeDb(), { client_id: "client-2" }, "client-2"),
      "item-1",
      { stage_id: null, client_id: null },
    );
    assertEquals(linked, { error: "אין גישה ללקוח" });
  });
});

describe("runningReply", () => {
  it("names the running engine and the pending film page", () => {
    const reply = runningReply("kling", "client-1", { id: "film-1" });
    assertStrictEquals(reply.already_running, true);
    assertStrictEquals(reply.engine, "Kling");
    assertEquals(reply.artifact, { id: "film-1" });
    assertStrictEquals(runningReply("other", null, null).engine, undefined);
  });
});
