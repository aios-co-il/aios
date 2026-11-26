import { assertEquals } from "jsr:@std/assert@1";
import { makeVoiceSender } from "./voice-sender.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";

/** A client whose functions.invoke records each call and answers `error`. */
function fakeFunctions(error: { message: string } | null = null) {
  const calls: Array<{ name: string; body: unknown }> = [];
  const sb = {
    functions: {
      invoke: (name: string, options: { body: unknown }) => {
        calls.push({ name, body: options.body });
        return Promise.resolve({ data: null, error });
      },
    },
  };
  return { sb, calls };
}

Deno.test("makeVoiceSender (AIO-654)", async (t) => {
  await t.step("names the receiving line to send-manus-wa-voice", async () => {
    const { sb, calls } = fakeFunctions();

    // @ts-expect-error: a stand-in with only functions.invoke
    const sent = await makeVoiceSender(sb, {
      tenantId: TENANT,
      integrationId: LINE,
    })("972501234567@c.us", "שלום");

    assertEquals(sent, true);
    assertEquals(calls, [
      {
        name: "send-manus-wa-voice",
        body: {
          tenant_id: TENANT,
          integration_id: LINE,
          to: "972501234567@c.us",
          text: "שלום",
        },
      },
    ]);
  });

  await t.step("without the receiving line nothing is sent", async () => {
    for (const integrationId of [null, undefined, ""]) {
      const { sb, calls } = fakeFunctions();

      // @ts-expect-error: a stand-in with only functions.invoke
      const sent = await makeVoiceSender(sb, {
        tenantId: TENANT,
        integrationId,
      })("972501234567@c.us", "שלום");

      assertEquals(sent, false);
      assertEquals(calls, []);
    }
  });

  await t.step("a refused call answers false", async () => {
    const { sb } = fakeFunctions({ message: "Edge Function returned 404" });

    // @ts-expect-error: a stand-in with only functions.invoke
    const sent = await makeVoiceSender(sb, {
      tenantId: TENANT,
      integrationId: LINE,
    })("972501234567@c.us", "שלום");

    assertEquals(sent, false);
  });
});
