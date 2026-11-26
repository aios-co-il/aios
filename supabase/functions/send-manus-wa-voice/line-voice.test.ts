import { assertEquals } from "jsr:@std/assert@1";
import { fakeTables } from "../_shared/carmen/test-tables.ts";
import type { VoiceLine } from "./handler.ts";
import { chooseLineVoice, dbLineVoiceReads } from "./line-voice.ts";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const OWNER = "55555555-5555-4555-8555-555555555555";

/** A line of TENANT; the organization's main line unless overridden. */
function line(fields: Partial<VoiceLine> = {}): VoiceLine {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    tenantId: TENANT,
    ownerUserId: OWNER,
    role: "primary",
    apiKey: "key",
    instanceId: "instance",
    gatewayUrl: null,
    ...fields,
  };
}

const personal = line({ role: "secondary" });

/** TENANT's Carmen with this voice. */
function carmen(voice: string | null) {
  return {
    id: "agent-1",
    tenant_id: TENANT,
    name: "כרמן",
    is_carmen: true,
    active: true,
    voice,
  };
}

const member = { tenant_id: TENANT, user_id: OWNER };

/** The owner's stored voice in a tenant. */
function pick(voice: string | null, tenantId = TENANT) {
  return { tenant_id: tenantId, user_id: OWNER, voice };
}

/** The voice the line speaks over these tables. */
function voiceOn(
  voiceLine: VoiceLine,
  tables: Record<string, Array<Record<string, unknown>>>,
): Promise<string> {
  // @ts-expect-error: fakeTables stands in for the service-role client
  return chooseLineVoice(voiceLine, dbLineVoiceReads(fakeTables(tables)));
}

Deno.test("chooseLineVoice (AIO-654)", async (t) => {
  await t.step(
    "the main line speaks the Carmen voice, not its user's pick",
    async () => {
      assertEquals(
        await voiceOn(line(), {
          ai_agents: [carmen("sage")],
          tenant_users: [member],
          carmen_user_choices: [pick("cedar")],
        }),
        "sage",
      );
    },
  );

  await t.step("a personal line speaks its owner's stored voice", async () => {
    assertEquals(
      await voiceOn(personal, {
        ai_agents: [carmen("sage")],
        tenant_users: [member],
        carmen_user_choices: [pick("cedar")],
      }),
      "cedar",
    );
  });

  await t.step(
    "an owner who left the tenant gets the Carmen voice",
    async () => {
      assertEquals(
        await voiceOn(personal, {
          ai_agents: [carmen("sage")],
          tenant_users: [],
          carmen_user_choices: [pick("cedar")],
        }),
        "sage",
      );
    },
  );

  await t.step("the owner's pick in another tenant is not used", async () => {
    assertEquals(
      await voiceOn(personal, {
        ai_agents: [
          carmen("sage"),
          { ...carmen("onyx"), tenant_id: OTHER_TENANT },
        ],
        tenant_users: [member, { tenant_id: OTHER_TENANT, user_id: OWNER }],
        carmen_user_choices: [pick("cedar", OTHER_TENANT)],
      }),
      "sage",
    );
  });

  await t.step(
    "a personal line without an owner gets the Carmen voice",
    async () => {
      assertEquals(
        await voiceOn(line({ role: "secondary", ownerUserId: null }), {
          ai_agents: [carmen("nova")],
        }),
        "nova",
      );
    },
  );

  await t.step(
    "an ElevenLabs pick falls back to the Carmen voice, then the default",
    async () => {
      const tables = {
        tenant_users: [member],
        carmen_user_choices: [pick("yael")],
      };

      assertEquals(
        await voiceOn(personal, { ...tables, ai_agents: [carmen("sage")] }),
        "sage",
      );
      assertEquals(
        await voiceOn(personal, { ...tables, ai_agents: [carmen("danit")] }),
        "shimmer",
      );
    },
  );

  await t.step("no pick and no Carmen voice speaks the default", async () => {
    assertEquals(
      await voiceOn(personal, { tenant_users: [member] }),
      "shimmer",
    );
  });

  await t.step(
    "a failed read falls back without blocking the note",
    async () => {
      const failing = {
        from: () => {
          const query = {
            select: () => query,
            eq: () => query,
            or: () => query,
            limit: () =>
              Promise.resolve({ data: null, error: { message: "boom" } }),
            maybeSingle: () =>
              Promise.resolve({ data: null, error: { message: "boom" } }),
          };
          return query;
        },
      };

      assertEquals(
        // @ts-expect-error: a stand-in whose every read fails
        await chooseLineVoice(personal, dbLineVoiceReads(failing)),
        "shimmer",
      );
    },
  );
});
