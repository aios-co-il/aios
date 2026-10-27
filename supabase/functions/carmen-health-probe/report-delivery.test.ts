import { assertEquals } from "jsr:@std/assert@1";
import { fakeSupabase } from "../_shared/testing/fake-supabase.mjs";
import { deliverHealthDigest } from "./report-delivery.ts";

const TENANT = "tenant-a";

const OWNER = {
  user_id: "u-owner",
  full_name: "Owner",
  phone: "0500000001",
  is_owner: true,
};

function db(
  rows: unknown[],
  queued: (args: { p_chat_id: string }) => boolean = () => true,
) {
  const notifies: unknown[] = [];
  const client = fakeSupabase(
    { carmen_report_recipients: rows },
    {
      rpc: {
        carmen_report_staff: () => [OWNER],
        claude_notify_david: (args: { p_chat_id: string }) => (
          notifies.push(args),
          { queued: queued(args) }
        ),
      },
    },
  );
  return { client, notifies };
}

Deno.test("deliverHealthDigest", async (t) => {
  await t.step("queues the digest to every configured recipient", async () => {
    const { client, notifies } = db([
      { tenant_id: TENANT, user_id: null, phone: "+972500000011", label: "A" },
      { tenant_id: TENANT, user_id: null, phone: "+972500000012", label: "B" },
    ]);

    const result = await deliverHealthDigest(client, TENANT, "health");

    assertEquals(result, { sent: true });
    assertEquals(notifies, [
      { p_message: "health", p_tenant: TENANT, p_chat_id: "972500000011" },
      { p_message: "health", p_tenant: TENANT, p_chat_id: "972500000012" },
    ]);
  });

  await t.step("an empty list sends to the owners", async () => {
    const { client, notifies } = db([]);

    await deliverHealthDigest(client, TENANT, "health");

    assertEquals(notifies, [
      { p_message: "health", p_tenant: TENANT, p_chat_id: "972500000001" },
    ]);
  });

  await t.step("nobody to send to is reported, not guessed", async () => {
    const { client, notifies } = db([]);
    const noOwnerPhone = {
      ...client,
      rpc: async (name: string, args: { p_chat_id: string }) =>
        name === "carmen_report_staff"
          ? { data: [{ ...OWNER, phone: null }], error: null }
          : client.rpc(name, args),
    };

    const result = await deliverHealthDigest(noOwnerPhone, TENANT, "health");

    assertEquals(result, {
      sent: false,
      error: "no report recipient with a phone",
    });
    assertEquals(notifies, []);
  });

  await t.step("not sent when claude-notify queued nothing", async () => {
    const { client } = db([], () => false);

    const result = await deliverHealthDigest(client, TENANT, "health");

    assertEquals(result, {
      sent: false,
      error: "claude_notify_david queued nothing",
    });
  });
});
