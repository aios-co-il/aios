/** Typed builders for the worker tests: whole rows and edits from the fields a test sets. */
import { buildTimeline } from "../src/compose/timeline.ts";
import type { Timeline, TimelineScene } from "../src/compose/types.ts";
import type { RunOutput, VideoRun } from "../src/jobs/types.ts";
import type { FetchImpl, LipsyncProvider } from "../src/providers/types.ts";

/** A marketing_runs row as claim_video_run returns it, with every column a test leaves unset. */
export const runOf = (fields: Partial<VideoRun> = {}): VideoRun => ({
  id: "run-1",
  tenant_id: "t1",
  kind: "clip",
  item_id: null,
  scene_id: null,
  stage_id: null,
  attempts: 0,
  provider: null,
  provider_job_id: null,
  input: null,
  output: null,
  ...fields,
});

/** A timeline as buildTimeline makes it with nothing set, then the test's fields. */
export const timelineOf = (fields: Partial<Timeline> = {}): Timeline => ({
  ...buildTimeline([]),
  ...fields,
});

/** One timeline scene as buildTimeline makes it from a bare clip, then the test's fields. */
export const sceneOf = (
  fields: Partial<TimelineScene> = {},
): TimelineScene => ({
  ...buildTimeline([{ id: "s1", clipPath: "clip.mp4" }]).scenes[0],
  ...fields,
});

/** One call a fake fetch received. */
export interface FetchCall {
  url: string;
  init: RequestInit;
}

/** The URL a fetch was called with, as a string. */
export const urlOf = (input: string | URL | Request) =>
  input instanceof Request ? input.url : String(input);

/** A request header a fetch was sent (case-insensitive), or null. */
export const headerOf = (init: RequestInit | undefined, name: string) =>
  new Headers(init?.headers).get(name);

/** The JSON body a fetch was sent; `Body` names the fields the test reads (not checked). */
export function jsonBodyOf<Body = unknown>(
  init: RequestInit | undefined,
): Body {
  const body: Body = JSON.parse(String(init?.body));
  return body;
}

/** A row patch a job sends with db.update. */
export interface RunPatch {
  output?: RunOutput;
  status?: string;
  provider?: string;
  provider_job_id?: string | null;
  [key: string]: unknown;
}

/** The arguments a job sends with db.rpc (attach_video_scene_asset and the like). */
export interface RpcArgs {
  p_meta?: RpcMeta;
  [key: string]: unknown;
}

/** The asset meta a job attaches: what made the file, and what it cost. */
export interface RpcMeta {
  generation_cost?: { usd: number; credits: number };
  [key: string]: unknown;
}

/** What a fake db records of a job's writes and reads. */
export interface DbCalls {
  uploads: Array<{
    bucket: string;
    path: string;
    size: number;
    bytes?: Uint8Array;
    contentType?: string;
  }>;
  rpcs: Array<{ name: string; args: RpcArgs }>;
  updates: Array<{ table: string; query: string; patch: RunPatch }>;
  downloads: Array<{ bucket: string; path: string }>;
  /** The order of downloads and updates, as `download:<path>` and `update`. */
  order: Array<string>;
  /** `<bucket>:<path>` of each download and each signed link. */
  buckets: Array<string>;
  signs: Array<string>;
}

/** An empty record of a fake db's calls. */
export const dbCalls = (): DbCalls => ({
  uploads: [],
  rpcs: [],
  updates: [],
  downloads: [],
  order: [],
  buckets: [],
  signs: [],
});

/** A fetch that answers with `handler`, which gets the URL as a string and the init (or {}). */
export const fakeFetch =
  (
    handler: (url: string, init: RequestInit) => Response | Promise<Response>,
  ): FetchImpl =>
  async (input, init = {}) =>
    handler(urlOf(input), init);

/** `value`, or a thrown error naming `what` when it is missing: a test reads a field it expects. */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`no ${what}`);
  }
  return value;
}

/** A lip-sync provider with the test's fields; the rest throw or price at 0 if a test reaches them. */
export const lipsyncProviderOf = (
  fields: Partial<LipsyncProvider> & Pick<LipsyncProvider, "name">,
): LipsyncProvider => ({
  model: `${fields.name}-model`,
  needs: "image",
  estimate: () => ({ credits: 0, usd: 0 }),
  submit: async () => {
    throw new Error(`${fields.name}: submit is not faked`);
  },
  poll: async () => {
    throw new Error(`${fields.name}: poll is not faked`);
  },
  ...fields,
});
