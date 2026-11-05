import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { executeWorkshopTool } from "../../workshop-tools.ts";
import { fakeDb, project } from "./test-fakes.ts";

Deno.test(
  "one budget approval from the user's tap covers the next paid steps",
  async () => {
    let generated = 0;
    const deps = (turnId: string, userText = "") => ({
      turnId,
      userText,
      newToken: () => `token-${turnId}`,
      generateImage: async () => {
        generated += 1;
        return { image_url: "https://x/a.png" };
      },
    });
    const call = (
      db: ReturnType<typeof fakeDb>,
      args: Record<string, unknown>,
      turn: string,
      userText?: string,
    ) =>
      executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_make_creative",
        { item_id: "item-1", prompt: "festive table", ...args },
        async () => {},
        null,
        deps(turn, userText),
      ) as Promise<Record<string, any>>;
    const lastPayload = (db: ReturnType<typeof fakeDb>) =>
      db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map((c) => (c.value as any).payload)
        .pop();
    const withPayload = (payload: unknown) => ({
      "marketing_work_items:select": {
        ...project["marketing_work_items:select"],
        payload,
      },
    });

    const askDb = fakeDb(project);
    const asked = await call(askDb, {}, "turn-1");
    assertStrictEquals(asked.needs_budget, true);
    assertStrictEquals(asked.refused, "no_budget");
    assertStrictEquals(asked.approval_token, "token-turn-1");
    assertMatch(asked.approval_prompt, /מאשר תקציב \$1 · URN1/);
    assertMatch(asked.say_to_user, /מאשר תקציב \$1 · URN1/);
    assertStrictEquals("message" in asked, false);
    assertStrictEquals(generated, 0);
    const pending = lastPayload(askDb);

    const sameTurn = await call(
      fakeDb(withPayload(pending)),
      { approval_token: "token-turn-1" },
      "turn-1",
      "מאשר תקציב URN1",
    );
    assertStrictEquals(sameTurn.refused, "same_turn");

    const notUser = await call(
      fakeDb(withPayload(pending)),
      { approval_token: "token-turn-1" },
      "turn-2",
      "תמשיכי",
    );
    assertStrictEquals(notUser.refused, "not_user");
    assertStrictEquals(generated, 0);

    const approveDb = fakeDb(withPayload(pending));
    const approved = await call(
      approveDb,
      { approval_token: "token-turn-1" },
      "turn-2",
      "מאשר תקציב URN1",
    );
    assertStrictEquals(approved.success, true);
    assertStrictEquals(generated, 2);
    const budget = lastPayload(approveDb).workshop_budget;
    assert(budget.cap_usd > 0);
    assert(budget.spent_usd > 0);
    assertStrictEquals(budget.request, undefined);

    const nextDb = fakeDb(withPayload(lastPayload(approveDb)));
    const next = await call(nextDb, {}, "turn-3");
    assertStrictEquals(next.success, true);
    assertStrictEquals(generated, 4);
  },
);

Deno.test(
  "asking again keeps the open budget request the user can still approve",
  async () => {
    const deps = (turnId: string) => ({
      turnId,
      newToken: () => `token-${turnId}`,
      generateImage: async () => ({ image_url: "https://x/a.png" }),
    });
    const call = (db: ReturnType<typeof fakeDb>, turn: string) =>
      executeWorkshopTool(
        db,
        "tenant-1",
        "workshop_make_creative",
        { item_id: "item-1", prompt: "festive table" },
        async () => {},
        null,
        deps(turn),
      ) as Promise<Record<string, any>>;
    const requestOf = (db: ReturnType<typeof fakeDb>) =>
      db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map((c) => (c.value as any).payload)
        .pop()?.workshop_budget?.request;

    const askDb = fakeDb(project);
    await call(askDb, "turn-1");
    const request = requestOf(askDb);
    const again = fakeDb({
      "marketing_work_items:select": {
        ...project["marketing_work_items:select"],
        payload: {
          ...(project["marketing_work_items:select"] as any).payload,
          workshop_budget: { cap_usd: 0, spent_usd: 0, request },
        },
      },
    });
    const asked = await call(again, "turn-2");
    assertStrictEquals(asked.approval_token, "token-turn-1");
    assertStrictEquals(requestOf(again)?.turn_id ?? "turn-1", "turn-1");
  },
);
