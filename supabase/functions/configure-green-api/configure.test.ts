import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import { configureGreenApi, type ConfigureDeps } from "./configure.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OUTSIDER = "55555555-5555-4555-8555-555555555555";
const LINE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WEBHOOK_URL = "https://api.example.test/functions/v1/green-api-webhook";

type GreenCall = { url: string; body: Record<string, unknown> };

/** One configure run: the caller, Green API's answer and the store's error. */
function setup(
  opts: {
    userId?: string | null;
    greenSaves?: boolean;
    storeFails?: boolean;
  } = {},
) {
  const { userId = OWNER, greenSaves = true, storeFails = false } = opts;
  const greenCalls: Array<GreenCall> = [];
  const stored: Array<Record<string, unknown>> = [];
  const db = fakeSupabase(
    {
      tenant_integrations: [
        {
          id: LINE_ID,
          tenant_id: TENANT,
          user_id: OWNER,
          settings: {},
          instance_id: "1101",
          api_key: "line-api-token",
          integration_type: "green_api",
          is_active: true,
          created_at: "2026-11-01T00:00:00Z",
        },
      ],
      tenant_users: [{ tenant_id: TENANT, user_id: OWNER }],
    },
    {
      failing: storeFails
        ? { store_green_api_webhook_token: "vault down" }
        : {},
      rpc: {
        is_super_admin: () => false,
        store_green_api_webhook_token: (args) => {
          stored.push(args);
          return null;
        },
      },
    },
  );
  const deps: ConfigureDeps = {
    db,
    authenticate: () =>
      Promise.resolve(userId ? { kind: "user", userId } : null),
    fetch: async (input, init) => {
      greenCalls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ saveSettings: greenSaves });
    },
    newToken: () => "fresh-token",
    webhookUrl: () => WEBHOOK_URL,
  };
  return { deps, greenCalls, stored };
}

/** The settings page's call, as GreenAPISettings.tsx sends it. */
function configureCall(body: Record<string, unknown>) {
  return new Request(
    "https://api.example.test/functions/v1/configure-green-api",
    {
      method: "POST",
      headers: { Authorization: "Bearer user-jwt" },
      body: JSON.stringify(body),
    },
  );
}

const OWN_LINE = { instanceId: "1101", apiToken: "line-api-token" };

/** Runs `fn` with console.warn and console.error silenced. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
}

Deno.test("configureGreenApi", async (t) => {
  await t.step(
    "gives the line a webhook token, and stores it once Green API saved it",
    async () => {
      const { deps, greenCalls, stored } = setup();

      const res = await configureGreenApi(configureCall(OWN_LINE), deps);

      assertStrictEquals(res.status, 200);
      assertEquals(greenCalls, [
        {
          url: "https://api.green-api.com/waInstance1101/setSettings/line-api-token",
          body: {
            webhookUrl: WEBHOOK_URL,
            webhookUrlToken: "Bearer fresh-token",
            outgoingWebhook: "yes",
            outgoingMessageWebhook: "yes",
            outgoingAPIMessageWebhook: "yes",
            incomingWebhook: "yes",
            stateWebhook: "no",
            deviceWebhook: "no",
          },
        },
      ]);
      assertEquals(stored, [
        { p_integration_id: LINE_ID, p_token: "fresh-token" },
      ]);
    },
  );

  await t.step("accepts the instance id as a number", async () => {
    const { deps, stored } = setup();

    const res = await configureGreenApi(
      configureCall({ ...OWN_LINE, instanceId: 1101 }),
      deps,
    );

    assertStrictEquals(res.status, 200);
    assertEquals(stored.length, 1);
  });

  await t.step("refuses a caller who is not signed in", async () => {
    const { deps, greenCalls, stored } = setup({ userId: null });

    const res = await configureGreenApi(configureCall(OWN_LINE), deps);

    assertStrictEquals(res.status, 401);
    assertEquals([greenCalls.length, stored.length], [0, 0]);
  });

  await t.step(
    "refuses a wrong API token without calling Green API",
    async () => {
      const { deps, greenCalls, stored } = setup();

      const res = await quietly(() =>
        configureGreenApi(
          configureCall({ ...OWN_LINE, apiToken: "someone-elses" }),
          deps,
        ),
      );

      assertStrictEquals(res.status, 403);
      assertEquals(await res.json(), { error: "Not allowed" });
      assertEquals([greenCalls.length, stored.length], [0, 0]);
    },
  );

  await t.step(
    "refuses a member of another tenant with the same reply",
    async () => {
      const { deps, greenCalls, stored } = setup({ userId: OUTSIDER });

      const res = await quietly(() =>
        configureGreenApi(configureCall(OWN_LINE), deps),
      );

      assertStrictEquals(res.status, 403);
      assertEquals(await res.json(), { error: "Not allowed" });
      assertEquals([greenCalls.length, stored.length], [0, 0]);
    },
  );

  await t.step(
    "stores no token when Green API did not save the settings",
    async () => {
      const { deps, greenCalls, stored } = setup({ greenSaves: false });

      const res = await quietly(() =>
        configureGreenApi(configureCall(OWN_LINE), deps),
      );

      assertStrictEquals(res.status, 502);
      assertEquals([greenCalls.length, stored.length], [1, 0]);
    },
  );

  await t.step(
    "reports a token that was not stored, so the owner refreshes again",
    async () => {
      const { deps } = setup({ storeFails: true });

      const res = await quietly(() =>
        configureGreenApi(configureCall(OWN_LINE), deps),
      );

      assertStrictEquals(res.status, 500);
      assertEquals(await res.json(), { error: "Webhook token was not saved" });
    },
  );

  await t.step(
    "refuses a request without an instance id or API token",
    async () => {
      const { deps, greenCalls } = setup();

      const res = await configureGreenApi(
        configureCall({ instanceId: "1101" }),
        deps,
      );

      assertStrictEquals(res.status, 400);
      assertEquals(greenCalls.length, 0);
    },
  );
});
