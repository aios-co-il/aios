/**
 * Fakes the stored-pick tests share: engines, the two engine resolvers and a
 * personal WhatsApp line's turn, so no test needs keys or a network.
 */
import type { BrainEngine } from "../_shared/carmen/brain-engine/load.ts";
import { USE_BRAIN_PICK } from "../_shared/carmen/brain-engine/stored-pick.ts";
import { fakeSupabase } from "../_shared/testing/fake-supabase.ts";
import type { PickEngineResolvers } from "./stored-brain-pick.ts";

/** A model brain that runs. */
export const groq: Extract<BrainEngine, { kind: "connections" }> = {
  kind: "connections",
  slug: "groq",
  targets: [],
  fallbackInternal: false,
};

/** What a request gets when no stored pick runs. */
export const withoutPick: BrainEngine = { kind: "internal" };

/**
 * Resolvers that record the bodies they were asked about, and how the stored
 * pick was resolved (as whom, with which options): the stored pick resolves
 * to `picked` (or throws it), any other request to `withoutPick`.
 */
export function resolvers(picked: BrainEngine | Error) {
  const asked: Array<unknown> = [];
  const pickedAs: Array<unknown> = [];
  const fakes: PickEngineResolvers = {
    resolveBrainEngine: (_sb, auth, body, options) => {
      asked.push(body);
      pickedAs.push({ auth, options });
      return picked instanceof Error
        ? Promise.reject(picked)
        : Promise.resolve(picked);
    },
    resolveWorkshopAwareEngine: (_sb, _auth, body) => {
      asked.push(body);
      return Promise.resolve(withoutPick);
    },
  };
  return { asked, pickedAs, fakes };
}

export const LINE_TENANT = "11111111-1111-4111-8111-111111111111";
export const LINE_OWNER = "22222222-2222-4222-8222-222222222222";
/** The organization's own Carmen, and another organization's. */
export const LINE_AGENT = "33333333-3333-4333-8333-333333333333";
export const FOREIGN_AGENT = "44444444-4444-4444-8444-444444444444";

/** What runCarmenAI sends for a turn on a personal WhatsApp line. */
export const lineAsks = {
  [USE_BRAIN_PICK]: true,
  tenant_id: LINE_TENANT,
  agent_id: LINE_AGENT,
  surface: "whatsapp",
  persona_user_id: LINE_OWNER,
};

/**
 * The line owner's stored `brain_slug` in their organization; `member` says
 * whether they still belong to it, and `failing` names a table whose reads fail.
 */
export function lineChoices(
  member: boolean,
  failing: Record<string, string> = {},
  brain_slug: string | null = "groq",
) {
  return fakeSupabase(
    {
      tenant_users: member
        ? [{ tenant_id: LINE_TENANT, user_id: LINE_OWNER }]
        : [{ tenant_id: "t-2", user_id: LINE_OWNER }],
      carmen_user_choices: [
        { tenant_id: LINE_TENANT, user_id: LINE_OWNER, brain_slug },
      ],
      ai_agents: [
        { id: LINE_AGENT, tenant_id: LINE_TENANT },
        { id: FOREIGN_AGENT, tenant_id: "t-2" },
      ],
    },
    { failing },
  );
}
