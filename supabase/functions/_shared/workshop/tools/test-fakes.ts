/** Fakes and fixtures the workshop tool tests share: a scripted Supabase client, projects, scenes. */
import { executeWorkshopTool as runWorkshopTool } from "../../workshop-tools.ts";

export type RunArgs = Parameters<typeof runWorkshopTool>;

/**
 * Most workshop tool tests start after the user approved. A bare confirmed=true here stands for that
 * approval (as if David approved it in the queue); the token flow has its own tests.
 */
export function executeWorkshopTool(...call: RunArgs) {
  const [db, tenantId, name, args, access, userId, deps] = call;
  const approved = args.confirmed === true && args.approval_token === undefined;
  return runWorkshopTool(db, tenantId, name, args, access, userId, {
    ...(deps ?? {}),
    ...(approved ? { approvedOutOfBand: true } : {}),
  });
}

export type Call = { table: string; op: string; value?: unknown };

/** A chainable stand-in for the Supabase client that records writes and answers reads from a script. */
export function fakeDb(script: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const db = {
    calls,
    rpc(name: string, value: unknown) {
      calls.push({ table: `rpc:${name}`, op: "rpc", value });
      const key = `rpc:${name}`;
      return Promise.resolve({
        data: key in script ? script[key] : null,
        error: script[`${key}:error`]
          ? { message: String(script[`${key}:error`]) }
          : null,
      });
    },
    from(table: string) {
      let op = "select";
      let value: unknown;
      const answer = () => {
        const key = `${table}:${op}`;
        const data =
          key in script
            ? script[key]
            : op === "insert"
              ? Array.isArray(value)
                ? value.map((_, index) => ({ id: `${table}-${index + 1}` }))
                : { id: `${table}-1` }
              : null;
        return { data, error: null };
      };
      const builder: Record<string, unknown> = {
        delete() {
          op = "delete";
          calls.push({ table, op });
          return builder;
        },
        insert(v: unknown) {
          op = "insert";
          value = v;
          calls.push({ table, op, value });
          return builder;
        },
        update(v: unknown) {
          op = "update";
          calls.push({ table, op, value: v });
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        match: () => builder,
        in: () => builder,
        gte: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () => Promise.resolve(answer()),
        maybeSingle: () => Promise.resolve(answer()),
        then: (resolve: (v: unknown) => unknown) => resolve(answer()),
      };
      return builder;
    },
  };
  return db;
}

export const project = {
  "marketing_work_items:select": {
    id: "item-1",
    title: "חג שמח",
    client_id: null,
    payload: {
      format: "1:1",
      workshop: { formats: ["9:16", "4:5"] },
      workshop_brief: { asked: true },

      workshop_look: {
        film: "cinematic, calm, female narrator",
        bible: "warm editorial look",
      },
    },
  },
};

export const videoProject = (over: Record<string, unknown> = {}) => ({
  "marketing_work_items:select": {
    id: "item-1",
    title: "כרמן ליד מחשב",
    client_id: "client-1",
    current_stage_id: "stage-1",
    payload: {
      format: "9:16",
      project_type: "video",
      video: { voice_id: "d4eLZ8u5dfBCsjp4YPyz" },
      // The user already chose the film's concept (film-concept.ts asks before any scene).
      workshop_brief: { asked: true, answers: { קונספט: "יום אחד" } },

      workshop_look: {
        film: "cinematic, calm, female narrator",
        bible: "warm editorial look",
      },
    },
    ...over,
  },
});

export const scene = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  position: 1,
  title: "",
  duration_s: 3,
  visual_prompt: "a woman at a laptop",
  voiceover_text: "שלום",
  still_asset_id: null,
  clip_asset_id: null,
  ...over,
});

export const bareProject = () =>
  videoProject({ payload: { format: "9:16", project_type: "video" } });

/** Carmen read the request and it settles none of the briefing questions. */
export const READ_NOTHING = { brief_answers: { none: "none" } };

export const silentFilm = (over: Record<string, unknown> = {}) => [
  scene("s-1", { duration_s: 5, voiceover_text: "", ...over }),
  scene("s-2", { duration_s: 5, voiceover_text: "", ...over }),
  scene("s-3", {
    duration_s: 8,
    voiceover_text: "",
    meta: { lipsync: true, dialogue: "שלום" },
    ...over,
  }),
];

export const encode = (text: string) => new TextEncoder().encode(text);

export interface SavedBrief {
  payload: {
    workshop_brief: { answers: Record<string, string>; asked?: boolean };
    workshop_look?: { references?: Array<string> };
  };
}
