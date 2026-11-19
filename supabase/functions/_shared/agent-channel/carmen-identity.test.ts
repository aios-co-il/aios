import { assertEquals, assertMatch, assertNotMatch } from "jsr:@std/assert@1";
import { carmenIdentityBlock, loadCarmenIdentity } from "./carmen-identity.ts";
import { buildCallbackInstructions, wrapDirectPrompt } from "./prompts.ts";

/** A db fake: each table's single-row read returns its entry in `rows`, or `error` for every read. */
function fakeDb(rows: Record<string, unknown>, error?: { message: string }) {
  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        or: () => query,
        limit: () => Promise.resolve({ data: error ? null : [], error }),
        maybeSingle: () =>
          Promise.resolve({
            data: error ? null : (rows[table] ?? null),
            error,
          }),
      };
      return query;
    },
  };
}

const identity = {
  assistantName: "כרמן",
  organizationName: "MarketingCaptain",
  addressLine: "🙋 **פנייה למשתמש:** המשתמש בשיחה: דוד.",
};

Deno.test("carmen identity", async (t) => {
  await t.step("names the assistant, the organization and the caller", () => {
    const block = carmenIdentityBlock(identity);
    assertMatch(block, /You are כרמן, Carmen/);
    assertMatch(block, /organization "MarketingCaptain"/);
    assertMatch(block, /המשתמש בשיחה: דוד/);
    assertMatch(block, /recall_memory in carmen-tools-mcp/);
    assertMatch(block, /estimated cost, and wait for the user's yes/);
  });

  await t.step("leaves the organization out when its name is unknown", () => {
    const block = carmenIdentityBlock({ ...identity, organizationName: "" });
    assertNotMatch(block, /for the organization/);
  });

  await t.step(
    "loads the organization name and the caller's profile",
    async () => {
      const loaded = await loadCarmenIdentity(
        fakeDb({
          tenants: { name: " MarketingCaptain " },
          profiles: { full_name: "דוד", gender: "male" },
        }) as never,
        "tenant-1",
        "user-1",
      );
      assertEquals(loaded.organizationName, "MarketingCaptain");
      assertEquals(loaded.assistantName, "כרמן");
      assertMatch(loaded.addressLine, /^🙋/);
      assertMatch(loaded.addressLine, /המשתמש בשיחה: דוד/);
    },
  );

  await t.step(
    "falls back instead of failing when the reads fail",
    async () => {
      const loaded = await loadCarmenIdentity(
        fakeDb({}, { message: "boom" }) as never,
        "tenant-1",
        "user-1",
      );
      assertEquals(loaded.organizationName, "");
      assertEquals(loaded.assistantName, "כרמן");
    },
  );
});

Deno.test("direct prompt opening and screen context", async (t) => {
  await t.step(
    "Claude Direct opens with Carmen instead of the generic line",
    () => {
      const prompt = wrapDirectPrompt({
        origin: "claude",
        userText: "תכיני קריאייטיב",
        history: [],
        opening: carmenIdentityBlock(identity),
      });
      assertMatch(prompt, /You are כרמן, Carmen/);
      assertNotMatch(prompt, /selected brain/);
    },
  );

  await t.step(
    "a follow-up with an empty opening carries only the task",
    () => {
      const prompt = wrapDirectPrompt({
        origin: "claude",
        userText: "ועכשיו גרסה אנכית",
        history: [],
        opening: "",
      });
      assertEquals(prompt, "User:\nועכשיו גרסה אנכית\n");
    },
  );

  await t.step("Cursor keeps its own identity line", () => {
    const prompt = wrapDirectPrompt({
      origin: "cursor",
      userText: "fix",
      history: [],
    });
    assertMatch(prompt, /\[AIOS Command Center · Cursor Direct\]/);
    assertMatch(prompt, /selected brain/);
  });

  await t.step("adds the sidecar screen and ignores anything else", () => {
    const screen = {
      source: "command_center_sidebar",
      path: "/t/mc/campaigns/42",
      page_title: "קמפיין קיץ",
    };
    const withScreen = wrapDirectPrompt({
      origin: "claude",
      userText: "מה רואים פה?",
      history: [],
      opening: "",
      screenContext: screen,
    });
    assertMatch(withScreen, /The screen the user is looking at in AIOS/);
    assertMatch(withScreen, /\/t\/mc\/campaigns\/42/);
    const other = wrapDirectPrompt({
      origin: "claude",
      userText: "x",
      history: [],
      opening: "",
      screenContext: { source: "elsewhere", path: "/secret" },
    });
    assertNotMatch(other, /\/secret/);
  });
});

Deno.test("callback instructions", async (t) => {
  const base = {
    conversationId: "c",
    sessionId: "s",
    tenantId: "t",
    token: "tok",
  };

  await t.step("asks for the PR link only when code changed", () => {
    const text = buildCallbackInstructions({ ...base, origin: "claude" });
    assertMatch(text, /When you changed code, your answer MUST include/);
    assertNotMatch(text, /David/);
  });

  await t.step("asks MCP brains for progress updates", () => {
    const text = buildCallbackInstructions({ ...base, origin: "claude" });
    assertMatch(text, /publish_aios_progress/);
  });

  await t.step(
    "leaves progress out for Workspace brains, which reply over HTTP",
    () => {
      const text = buildCallbackInstructions({ ...base, origin: "codex" });
      assertNotMatch(text, /publish_aios_progress/);
    },
  );
});
