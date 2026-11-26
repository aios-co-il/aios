/**
 * Fakes the stored-pick tests share: engines and the two engine resolvers,
 * so no test needs keys or a network.
 */
import type { BrainEngine } from "../_shared/carmen/brain-engine/load.ts";
import type { PickEngineResolvers } from "./stored-brain-pick.ts";

/** A model brain that runs. */
export const groq: BrainEngine = {
  kind: "connections",
  slug: "groq",
  targets: [],
  fallbackInternal: false,
};

/** What a request gets when no stored pick runs. */
export const withoutPick: BrainEngine = { kind: "internal" };

/**
 * Resolvers that record the bodies they were asked about: the stored pick
 * resolves to `picked` (or throws it), any other request to `withoutPick`.
 */
export function resolvers(picked: BrainEngine | Error) {
  const asked: Array<unknown> = [];
  const fakes: PickEngineResolvers = {
    resolveBrainEngine: (_sb, _auth, body) => {
      asked.push(body);
      return picked instanceof Error
        ? Promise.reject(picked)
        : Promise.resolve(picked);
    },
    resolveWorkshopAwareEngine: (_sb, _auth, body) => {
      asked.push(body);
      return Promise.resolve(withoutPick);
    },
  };
  return { asked, fakes };
}
