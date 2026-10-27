import { assertEquals } from "jsr:@std/assert@1";
import type { GuardResult } from "../_shared/integration-guard.ts";
import type { SenderLine } from "../_shared/report-sender/line-access.ts";
import {
  type GreenFileSendDeps,
  type GreenFileSendInput,
  prepareGreenFileSend,
} from "./prepare.ts";

const TENANT = "tenant-a";
const MEMBER = "user-member";
const COLLEAGUE = "user-colleague";

/** A ready Green API line of the given tenant and owner. */
const line = (id: string, tenant_id: string, user_id = MEMBER): SenderLine => ({
  id,
  tenant_id,
  user_id,
  api_key: "token",
  settings: { instance_id: `inst-${id}` },
});

const lines: Record<string, SenderLine> = {
  own: line("own", TENANT),
  foreign: line("foreign", "tenant-c"),
  colleaguePrivate: line("colleaguePrivate", TENANT, COLLEAGUE),
};

const ALLOW: GuardResult = {
  decision: "ALLOW",
  reason: "production",
  environment: "production",
};

/** Deps over the fixture lines; the legacy pick is the caller's own line. */
function deps(overrides: Partial<GreenFileSendDeps> = {}): GreenFileSendDeps {
  return {
    store: {
      findActiveLine: async (id, type) =>
        type === "green_api" ? (lines[id] ?? null) : null,
      senderUsable: async (tenantId, id, userId) =>
        tenantId === TENANT &&
        (id === "own" || (id === "colleaguePrivate" && userId === COLLEAGUE)),
      isMember: async (tenantId, userId) =>
        tenantId === TENANT && userId === MEMBER,
      isSuperAdmin: async () => false,
    },
    legacyLine: async () => lines.own,
    guard: () => ALLOW,
    ...overrides,
  };
}

const send: GreenFileSendInput = {
  tenantId: TENANT,
  userId: MEMBER,
  integrationId: "own",
  groupId: null,
  groupChatId: undefined,
  phoneNumber: "0501234567",
};

Deno.test("prepareGreenFileSend refuses", async (t) => {
  await t.step("a caller who is not a member of the tenant", async () => {
    assertEquals(
      await prepareGreenFileSend(deps(), { ...send, userId: "user-stranger" }),
      {
        refusal: {
          status: 403,
          body: { error: "Forbidden", code: "forbidden" },
        },
      },
    );
  });

  await t.step("another tenant's line, never swapped for one", async () => {
    assertEquals(
      await prepareGreenFileSend(deps(), { ...send, integrationId: "foreign" }),
      {
        refusal: {
          status: 403,
          body: { error: "sender_not_allowed", code: "sender_not_allowed" },
        },
      },
    );
  });

  await t.step("another member's private line", async () => {
    // Member B naming member A's own WhatsApp: the client never gets it.
    assertEquals(
      await prepareGreenFileSend(deps(), {
        ...send,
        integrationId: "colleaguePrivate",
      }),
      {
        refusal: {
          status: 403,
          body: { error: "sender_not_allowed", code: "sender_not_allowed" },
        },
      },
    );
  });

  await t.step("a recipient Staging may not send to", async () => {
    const destinations: string[] = [];
    const result = await prepareGreenFileSend(
      deps({
        guard: (destination) => {
          destinations.push(destination);
          return {
            decision: "BLOCK",
            reason: "not_in_allowlist",
            environment: "staging",
          };
        },
      }),
      send,
    );
    assertEquals(destinations, ["972501234567@c.us"]);
    assertEquals(
      "refusal" in result ? result.refusal.body.error : null,
      "blocked_by_staging_safe_mode",
    );
  });

  await t.step("a send with no recipient", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      phoneNumber: null,
    });
    assertEquals("refusal" in result ? result.refusal.status : null, 400);
  });
});

Deno.test("prepareGreenFileSend resolves the line and chat", async (t) => {
  await t.step("the named line, to a group", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      groupId: "group-1",
      groupChatId: "120363416882903532@g.us",
    });
    assertEquals(result, {
      line: lines.own,
      chatId: "120363416882903532@g.us",
      usedGroupChat: true,
    });
  });

  await t.step("without a named line, the legacy pick", async () => {
    const result = await prepareGreenFileSend(deps(), {
      ...send,
      integrationId: null,
    });
    assertEquals("line" in result ? result.line.id : null, "own");
  });
});
