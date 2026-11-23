import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";

import {
  callsOn,
  fakeDb,
  ok,
} from "../_shared/meeting-bot/video-storage-db.test-fixture.ts";
import {
  checkWebhookSecret,
  recordSecretCheck,
  type SecretIntegration,
  WEBHOOK_ERROR_REFRESH_MS,
} from "./webhook-secret.ts";

const NOW = Date.parse("2026-11-22T10:00:00Z");

/** The integration from Production's report: saved secret differs from the gateway's. */
function integration(
  extra: SecretIntegration["settings"] = {},
): SecretIntegration {
  return {
    id: "integ-1",
    tenant_id: "tenant-1",
    settings: {
      instance_id: "inst-1",
      webhook_secret: "b543dd-saved",
      ...extra,
    },
  };
}

describe("checkWebhookSecret", () => {
  it("matches only the saved secret", () => {
    assertEquals(checkWebhookSecret("b543dd-saved", "b543dd-saved"), "match");
    assertEquals(
      checkWebhookSecret("b543dd-saved", "huHGEz-gateway"),
      "mismatch",
    );
    assertEquals(checkWebhookSecret("b543dd-saved", ""), "mismatch");
  });

  it("adopts the first secret when none is saved", () => {
    assertEquals(checkWebhookSecret("", "huHGEz-gateway"), "adopt");
    assertEquals(checkWebhookSecret("", ""), "match");
  });
});

describe("recordSecretCheck", () => {
  it("records a mismatch on the tenant's integration", async () => {
    const { client, calls } = fakeDb({ tenant_integrations: [ok(null)] });

    await recordSecretCheck(client, integration(), "mismatch", NOW);

    assertEquals(callsOn(calls, "tenant_integrations"), [
      [
        "update",
        {
          settings: {
            instance_id: "inst-1",
            webhook_secret: "b543dd-saved",
            webhook_error: {
              reason: "secret_mismatch",
              at: new Date(NOW).toISOString(),
            },
          },
        },
      ],
      ["eq", "id", "integ-1"],
      ["eq", "tenant_id", "tenant-1"],
    ]);
  });

  it("does not rewrite a mismatch recorded within the refresh window", async () => {
    const { client, calls } = fakeDb({});
    const recent = new Date(NOW - WEBHOOK_ERROR_REFRESH_MS / 2).toISOString();

    await recordSecretCheck(
      client,
      integration({ webhook_error: { reason: "secret_mismatch", at: recent } }),
      "mismatch",
      NOW,
    );

    assertEquals(calls, []);
  });

  it("clears a recorded mismatch once the secret matches", async () => {
    const { client, calls } = fakeDb({ tenant_integrations: [ok(null)] });
    const old = new Date(NOW - 1000).toISOString();

    await recordSecretCheck(
      client,
      integration({ webhook_error: { reason: "secret_mismatch", at: old } }),
      "match",
      NOW,
    );

    const [update] = callsOn(calls, "tenant_integrations");
    const settings = (update[1] as { settings: Record<string, unknown> })
      .settings;
    assertEquals(settings.webhook_error, null);
  });

  it("writes nothing when a match has no error to clear", async () => {
    const { client, calls } = fakeDb({});

    await recordSecretCheck(client, integration(), "match", NOW);

    assertEquals(calls, []);
  });

  it("throws when the update fails, so the caller logs it", async () => {
    const { client } = fakeDb({
      tenant_integrations: [{ data: null, error: { message: "db down" } }],
    });

    await assertRejects(
      () => recordSecretCheck(client, integration(), "mismatch", NOW),
      Error,
      "db down",
    );
  });
});
