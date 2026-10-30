/**
 * Which model runs Carmen's agent loop for the brain the user picked. Every
 * connected chat-model brain runs as Carmen, with her tools, data and
 * permission rules; only the model behind the loop changes. Pure, so the
 * choice can be tested without a database.
 */
import {
  pickableConnections,
  type ModelRouteRow,
} from "../free-first/candidates.ts";
import type { BrainProfile } from "../brain-connections/types.ts";

/** A chat-model connection as the loader reads it. */
export type EngineConnection = {
  id: string;
  slug: string;
  name: string;
  base_url: string | null;
  model: string | null;
  profile: BrainProfile;
  key_last4: string | null;
};

/** The picked brain's row in agent_brain_routes. */
export type EngineRoute = {
  slug: string;
  label: string;
  route_type: string;
  connection_id: string | null;
  active: boolean | null;
  config: Record<string, unknown> | null;
};

export type BrainEnginePlan =
  /** Carmen's own engine (the agent's model and the tenant's AI keys). */
  | { kind: "internal" }
  /** Carmen's loop on these connections, in order; then maybe her own engine. */
  | {
      kind: "connections";
      slug: string;
      connections: EngineConnection[];
      fallbackInternal: boolean;
    }
  /** Nothing may run; the message says why and what to change. */
  | { kind: "refused"; message: string };

export const NOT_APPROVED_FOR_CLIENT_DATA = (name: string) =>
  `${name} עדיין לא מאושר לעבוד עם נתוני לקוחות, ולכן הוא לא יכול לפעול ככרמן. ` +
  'הפעילו "מותר לשלוח לו מידע של לקוחות" בעריכת המוח (מוחות, חיבורים ומפתחות AI).';

const NOT_READY = (label: string) =>
  `${label}: החיבור לא מוגדר עד הסוף (כתובת, מודל או מפתח חסרים).`;

const NO_FREE_BRAIN =
  "נתב חכם: אין מוח חינמי שמאושר לנתוני לקוחות, ואין לך הרשאה למוח הראשי של כרמן.";

/** A connection with endpoint, model and key. */
function ready(
  c: Pick<EngineConnection, "base_url" | "model" | "key_last4">,
): boolean {
  return !!c.base_url && !!c.model && !!c.key_last4;
}

/**
 * A brain that may run without the user picking it: ready, free and approved for client
 * data. A paid brain never runs automatically, because nothing tracks its spend yet (AIO-211).
 */
export function runsUnpicked(
  c: Pick<EngineConnection, "base_url" | "model" | "key_last4" | "profile">,
): boolean {
  return (
    ready(c) && c.profile.tier === "free" && c.profile.client_data_ok === true
  );
}

/**
 * The plan for `route`. A model brain runs Carmen's loop only when its owner
 * approved client data for it, because the loop sends Carmen's context and
 * tool results. "נתב חכם" uses the free, approved brains the user could pick,
 * then Carmen's own engine when the user holds that grant. A paid brain never
 * runs unless the user picked it.
 */
export function planBrainEngine(
  route: EngineRoute | null,
  conns: EngineConnection[],
  modelRoutes: ModelRouteRow[],
  allowed: (slug: string) => boolean,
): BrainEnginePlan {
  if (!route || route.route_type !== "model") return { kind: "internal" };

  if (route.config?.router === "free_first") {
    const free = pickableConnections(conns, modelRoutes, allowed).filter(
      runsUnpicked,
    );
    const fallbackInternal = allowed("internal");
    if (free.length === 0)
      return fallbackInternal
        ? { kind: "internal" }
        : { kind: "refused", message: NO_FREE_BRAIN };
    return {
      kind: "connections",
      slug: route.slug,
      connections: free,
      fallbackInternal,
    };
  }

  const conn = conns.find((c) => c.id === route.connection_id);
  if (!conn || !ready(conn))
    return { kind: "refused", message: NOT_READY(route.label) };
  if (conn.profile.client_data_ok !== true)
    return {
      kind: "refused",
      message: NOT_APPROVED_FOR_CLIENT_DATA(conn.name),
    };
  return {
    kind: "connections",
    slug: route.slug,
    connections: [conn],
    fallbackInternal: false,
  };
}
