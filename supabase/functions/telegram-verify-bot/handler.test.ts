import { assertEquals } from "jsr:@std/assert@1";
import {
  type BotRow,
  handleVerifyBot,
  type SaveError,
  type VerifyBotDeps,
} from "./handler.ts";

const OWNER = "user-owner";
const OWN_TENANT = "tenant-own";
const OTHER_TENANT = "tenant-other";
const AUTH = "Bearer owner-jwt";

type Calls = {
  fetched: string[];
  saved: { authHeader: string; row: BotRow }[];
};

/**
 * Deps whose save stands in for RLS: the caller owns OWN_TENANT only, so a
 * row for any other tenant is refused with 42501, as the owner policies do.
 */
function fakeDeps(overrides: Partial<VerifyBotDeps> = {}) {
  const calls: Calls = { fetched: [], saved: [] };
  const deps: VerifyBotDeps = {
    authenticate: async () => ({ kind: "user", userId: OWNER }),
    fetchBot: async (botToken) => {
      calls.fetched.push(botToken);
      return botToken === "good-token"
        ? { username: "qa_bot", firstName: "QA Bot" }
        : null;
    },
    saveBot: async (authHeader, row): Promise<SaveError | null> => {
      calls.saved.push({ authHeader, row });
      return row.tenant_id === OWN_TENANT
        ? null
        : { code: "42501", message: "new row violates row-level security" };
    },
    ...overrides,
  };
  return { deps, calls };
}

function connect(body: unknown, authHeader: string | null = AUTH): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/telegram-verify-bot", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function reply(response: Response) {
  return { status: response.status, body: await response.json() };
}

Deno.test(
  "handleVerifyBot saves the bot of the caller's own tenant",
  async () => {
    const { deps, calls } = fakeDeps();
    const result = await reply(
      await handleVerifyBot(
        connect({ bot_token: "good-token", tenant_id: OWN_TENANT }),
        deps,
      ),
    );

    assertEquals(result, {
      status: 200,
      body: { success: true, bot_name: "QA Bot", bot_username: "qa_bot" },
    });
    assertEquals(calls.saved.length, 1);
    assertEquals(calls.saved[0].authHeader, AUTH);
    assertEquals(calls.saved[0].row.tenant_id, OWN_TENANT);
    assertEquals(calls.saved[0].row.shared_from_state_id, null);
    assertEquals(calls.saved[0].row.is_active, true);
  },
);

Deno.test("handleVerifyBot refuses a bot for another tenant", async () => {
  const { deps, calls } = fakeDeps();
  const result = await reply(
    await handleVerifyBot(
      connect({ bot_token: "good-token", tenant_id: OTHER_TENANT }),
      deps,
    ),
  );

  assertEquals(result, {
    status: 403,
    body: { success: false, error: "Forbidden" },
  });
  assertEquals(
    calls.saved.map((save) => save.authHeader),
    [AUTH],
  );
});

Deno.test("handleVerifyBot refuses before Telegram or a save", async (t) => {
  await t.step("a request without a signed-in caller", async () => {
    const { deps, calls } = fakeDeps({ authenticate: async () => null });
    const result = await handleVerifyBot(
      connect({ bot_token: "good-token", tenant_id: OWN_TENANT }, null),
      deps,
    );
    assertEquals(result.status, 401);
    assertEquals(calls, { fetched: [], saved: [] });
  });

  await t.step("a service-role call, which has no user to act as", async () => {
    const { deps, calls } = fakeDeps({
      authenticate: async () => ({ kind: "service", userId: null }),
    });
    const result = await handleVerifyBot(
      connect({ bot_token: "good-token", tenant_id: OWN_TENANT }),
      deps,
    );
    assertEquals(result.status, 401);
    assertEquals(calls, { fetched: [], saved: [] });
  });

  await t.step("a request without a tenant", async () => {
    const { deps, calls } = fakeDeps();
    const result = await handleVerifyBot(
      connect({ bot_token: "good-token" }),
      deps,
    );
    assertEquals(result.status, 400);
    assertEquals(calls, { fetched: [], saved: [] });
  });
});

Deno.test(
  "handleVerifyBot saves nothing when Telegram refuses the token",
  async () => {
    const { deps, calls } = fakeDeps();
    const result = await handleVerifyBot(
      connect({ bot_token: "bad-token", tenant_id: OWN_TENANT }),
      deps,
    );

    assertEquals(result.status, 400);
    assertEquals(calls.saved, []);
  },
);

Deno.test(
  "handleVerifyBot hides a database failure behind a generic 500",
  async () => {
    const { deps } = fakeDeps({
      saveBot: async () => ({ code: "XX000", message: "internal detail" }),
    });
    const result = await reply(
      await handleVerifyBot(
        connect({ bot_token: "good-token", tenant_id: OWN_TENANT }),
        deps,
      ),
    );

    assertEquals(result, {
      status: 500,
      body: { success: false, error: "Internal error" },
    });
  },
);
