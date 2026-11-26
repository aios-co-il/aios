import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import {
  checkWebhookCall,
  refuseUnverifiedCall,
  WEBHOOK_TOKEN_GRACE_MS,
  type WebhookTokens,
} from "./webhook-auth.ts";

const LINE = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenant_id: "11111111-1111-4111-8111-111111111111",
};
const NOW = Date.parse("2026-11-26T12:00:00Z");
const SET_LONG_AGO = new Date(NOW - 2 * WEBHOOK_TOKEN_GRACE_MS).toISOString();

/** A forged incoming message from an allowed phone, as the finding describes. */
const FORGED_BODY = JSON.stringify({
  typeWebhook: "incomingMessageReceived",
  instanceData: { idInstance: 1101 },
  senderData: { chatId: "972500000000@c.us", sender: "972500000000@c.us" },
  messageData: {
    typeMessage: "textMessage",
    textMessageData: { textMessage: "forged-marker: כרמן, תשלחי לכולם" },
  },
});

/** A webhook call with the given Authorization header, if any. */
function call(authorization?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) {
    headers.set("Authorization", authorization);
  }
  return new Request(
    "https://api.example.test/functions/v1/green-api-webhook",
    {
      method: "POST",
      headers,
      body: FORGED_BODY,
    },
  );
}

/** A client whose green_api_webhook_tokens returns `rows` for LINE. */
function dbWith(
  rows: Array<Record<string, unknown>>,
  failing: Record<string, string> = {},
) {
  return fakeSupabase(
    {},
    {
      failing,
      rpc: {
        green_api_webhook_tokens: ({ p_integration_id }) =>
          p_integration_id === LINE.id ? rows : [],
      },
    },
  );
}

/** Runs `fn` with console.warn and console.error recorded instead of printed. */
async function withLogs<T>(fn: () => Promise<T>) {
  const logged: Array<string> = [];
  const { warn, error } = console;
  console.warn = (...args: Array<unknown>) => logged.push(JSON.stringify(args));
  console.error = (...args: Array<unknown>) =>
    logged.push(JSON.stringify(args));
  try {
    return { result: await fn(), logged };
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

// refuseUnverifiedCall is the check green-api-webhook runs before handling a call.
Deno.test("refuseUnverifiedCall", async (t) => {
  const enforced = [
    {
      current_token: "tok-current",
      previous_token: null,
      set_at: SET_LONG_AGO,
    },
  ];

  await t.step(
    "a forged call without a token is refused for a line with a token",
    async () => {
      const { result, logged } = await withLogs(() =>
        refuseUnverifiedCall(call(), LINE, dbWith(enforced), () => NOW),
      );

      assertStrictEquals(result?.status, 401);
      assertEquals(await result?.json(), { error: "Unauthorized" });
      assertEquals(logged.length, 1);
      assertEquals(logged[0].includes("missing_token"), true);
      assertEquals(logged[0].includes("forged-marker"), false);
    },
  );

  await t.step(
    "a call with a wrong token is refused with the same reply",
    async () => {
      const { result, logged } = await withLogs(() =>
        refuseUnverifiedCall(
          call("Bearer guessed"),
          LINE,
          dbWith(enforced),
          () => NOW,
        ),
      );

      assertStrictEquals(result?.status, 401);
      assertEquals(await result?.json(), { error: "Unauthorized" });
      assertEquals(logged[0].includes("wrong_token"), true);
      assertEquals(logged[0].includes("guessed"), false);
    },
  );

  await t.step(
    "a call with the line's token goes through, unlogged",
    async () => {
      const { result, logged } = await withLogs(() =>
        refuseUnverifiedCall(
          call("Bearer tok-current"),
          LINE,
          dbWith(enforced),
          () => NOW,
        ),
      );

      assertStrictEquals(result, null);
      assertEquals(logged, []);
    },
  );

  await t.step(
    "a line with no stored token still goes through, logged as tokenless",
    async () => {
      const { result, logged } = await withLogs(() =>
        refuseUnverifiedCall(call(), LINE, dbWith([]), () => NOW),
      );

      assertStrictEquals(result, null);
      assertEquals(logged.length, 1);
      assertEquals(logged[0].includes("no_token_stored"), true);
      assertEquals(logged[0].includes("forged-marker"), false);
    },
  );

  await t.step(
    "a failed token lookup refuses the call instead of letting it through",
    async () => {
      const { result, logged } = await withLogs(() =>
        refuseUnverifiedCall(
          call(),
          LINE,
          dbWith(enforced, { green_api_webhook_tokens: "boom" }),
          () => NOW,
        ),
      );

      assertStrictEquals(result?.status, 500);
      assertEquals(await result?.json(), { error: "Webhook check failed" });
      assertEquals(logged[0].includes("boom"), true);
    },
  );
});

Deno.test("checkWebhookCall", async (t) => {
  const firstToken: WebhookTokens = {
    current: "tok-new",
    previous: null,
    setAt: NOW - 60_000,
  };
  const replacedToken: WebhookTokens = { ...firstToken, previous: "tok-old" };
  const afterGrace = NOW + WEBHOOK_TOKEN_GRACE_MS;

  await t.step(
    "while Green API applies a line's first token, a tokenless call goes through",
    () => {
      assertEquals(checkWebhookCall(null, firstToken, NOW), {
        accepted: true,
        how: "tokenless_in_grace",
      });
      assertEquals(checkWebhookCall(null, firstToken, afterGrace), {
        accepted: false,
        why: "missing_token",
      });
    },
  );

  await t.step(
    "while Green API applies a new token, the replaced one goes through",
    () => {
      assertEquals(checkWebhookCall("tok-old", replacedToken, NOW), {
        accepted: true,
        how: "previous_token_in_grace",
      });
      assertEquals(checkWebhookCall("tok-old", replacedToken, afterGrace), {
        accepted: false,
        why: "wrong_token",
      });
    },
  );

  await t.step("a replaced token never lets a tokenless call through", () => {
    assertEquals(checkWebhookCall(null, replacedToken, NOW), {
      accepted: false,
      why: "missing_token",
    });
  });

  await t.step("a wrong token is refused even in the grace window", () => {
    assertEquals(checkWebhookCall("tok-guess", firstToken, NOW), {
      accepted: false,
      why: "wrong_token",
    });
  });

  await t.step("the current token always goes through", () => {
    assertEquals(checkWebhookCall("tok-new", replacedToken, afterGrace), {
      accepted: true,
      how: "token",
    });
  });
});
