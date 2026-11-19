/** Fixtures the landing build and publish tests share: an approved project, its settings, a fake repository. */
import { buildDigest, contentJson } from "../landing/page-files.ts";
import type { LandingRepo } from "../landing/repo.ts";
import { executeApprovedWorkshopTool, fakeDb } from "./test-fakes.ts";

/** A tool result or a stored row, read loosely in assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form JSON a test reads into
export type Loose = Record<string, any>;

const form = { buttonLabel: "לתיאום שיחה", successMessage: "תודה" };
export const blocks = [
  { type: "hero" as const, heading: "כותרת", form },
  { type: "leadForm" as const, heading: "השאירו פרטים", form },
];
const style = {
  primaryColor: "#112233",
  hero: "dark" as const,
  direction: "נקי",
};
export const approved = {
  blocks,
  copy_approved: true,
  style,
  style_approved: true,
};
export const digest = await buildDigest(
  { subdomain: "acme", slug: "offer", title: "מבצע" },
  contentJson(blocks, style),
);
export const built = {
  branch: "page/acme/offer",
  commit: "commit-1",
  digest,
  preview_url: "https://preview.example/offer?site=acme",
};
export const OUR_SITE = '{"tenantId":"tenant-1","clientId":"client-1"}';

/** A fake database: a landing project in the given state, with its page and site settings. */
export function landingDb(
  state: Record<string, unknown>,
  page: Loose | null = {},
  site: Loose = {},
) {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "מבצע",
      client_id: null,
      payload: { project_type: "landing", landing: state },
    },
    "landing_pages:select": page && {
      slug: "offer",
      title: "מבצע",
      site_id: "site-1",
      lead_to_crm: true,
      lead_to_webhook: false,
      ...page,
    },
    "landing_sites:select": {
      subdomain: "acme",
      client_id: "client-1",
      gtm_id: null,
      ga4_id: null,
      meta_pixel_id: null,
      ...site,
    },
    "clients:select": { name: "Acme" },
  });
  // A saved project is what the next read returns, as in the real database: the build tool
  // reads the project again before each write.
  const from = db.from.bind(db);
  db.from = (table: string) => {
    const builder = from(table);
    const update = builder.update as (value: Loose) => typeof builder;
    builder.update = (value: Loose) => {
      if (table === "marketing_work_items" && value.payload) {
        // Read back with its keys reordered, as jsonb does.
        (db.script["marketing_work_items:select"] as Loose).payload =
          jsonbOrder(value.payload);
      }
      return update(value);
    };
    return builder;
  };
  return db;
}

/** A copy of a JSON value with object keys in jsonb's order: shorter keys first, then bytewise. */
function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(jsonbOrder);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const keys = Object.keys(value).sort((a, b) =>
    a.length === b.length ? (a < b ? -1 : 1) : a.length - b.length,
  );
  return Object.fromEntries(
    keys.map((key) => [key, jsonbOrder((value as Loose)[key])]),
  );
}

/** A fake repository that records what Carmen pushes and opens. */
export function fakeRepo(files: Record<string, string> = {}, preview = true) {
  const pushes: Array<{ branch: string; files: Record<string, string> }> = [];
  const pulls: Array<string> = [];
  const repo: LandingRepo = {
    readFile: (path) => Promise.resolve(files[path] ?? null),
    pushFiles: (branch, pushed) => {
      pushes.push({ branch, files: pushed });
      return Promise.resolve("commit-1");
    },
    previewUrl: () =>
      Promise.resolve(preview ? "https://preview.example" : null),
    openPull: (branch) => {
      pulls.push(branch);
      return Promise.resolve("https://github.example/pull/1");
    },
  };
  return { repo, pushes, pulls };
}

/** Runs one landing tool on item-1 with the given repository. */
export async function run(
  db: ReturnType<typeof fakeDb>,
  name: string,
  repo?: LandingRepo,
  args: Record<string, unknown> = {},
  access?: (clientId: string) => Promise<void>,
): Promise<Loose> {
  return (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { item_id: "item-1", ...args },
    access,
    null,
    { landingRepo: repo, sleep: () => Promise.resolve() },
  )) as Loose;
}

/** The landing state the tool saved last. */
export function savedLanding(db: ReturnType<typeof fakeDb>): Loose {
  const update = db.calls.findLast((call) => call.op === "update");
  return (update?.value as Loose).payload.landing;
}
