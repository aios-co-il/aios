/** A film's rows for the music job tests: three scenes, their narration take, a call to action. */
import { vi } from "vitest";

export const TENANT = "t1";
export const ITEM = "item1";
export const CTA =
  "הירשמו לרשימת ההמתנה — 1000 הנרשמים הראשונים יקבלו את חבילת הבסיס בחינם לכל החיים!";

export const LINES = ["שלום לכולם", "זאת כרמן", "הירשמו עכשיו"];
export const SCRIPT = LINES.join(" ");

/** The take's character alignment: each line spoken across [from, to] seconds. */
export function take(spans) {
  const alignment = {
    characters: [],
    character_start_times_seconds: [],
    character_end_times_seconds: [],
  };
  spans.forEach(([from, to], index) => {
    const chars = [...(index ? ` ${LINES[index]}` : LINES[index])];
    const step = (to - from) / chars.length;
    chars.forEach((ch, i) => {
      alignment.characters.push(ch);
      alignment.character_start_times_seconds.push(from + i * step);
      alignment.character_end_times_seconds.push(from + (i + 1) * step);
    });
  });
  return alignment;
}
// Three 3.5 s scenes (10.5 s planned); the narration runs 14 s.
export const ALIGNMENT = take([
  [0, 3],
  [4.5, 9],
  [10, 14],
]);

export const scenes = () =>
  LINES.map((line, index) => ({
    id: `s${index + 1}`,
    position: index + 1,
    duration_s: 3.5,
    voiceover_text: line,
    voice_asset_id: null,
    meta: {},
  }));

export function filmDb({
  narration = null,
  pending = [],
  payload = { cta_text: CTA },
  rows = scenes(),
} = {}) {
  const queries = [];
  return {
    queries,
    async select(table, query) {
      queries.push([table, query]);
      if (table === "marketing_video_scenes") return rows;
      if (table === "marketing_work_items")
        return query.includes("select=payload")
          ? [{ payload }]
          : [{ id: ITEM, tenant_id: TENANT, client_id: null }];
      if (table === "marketing_runs")
        return typeof pending === "function" ? pending() : pending;
      if (table === "marketing_assets" && query.includes("type=eq.narration"))
        return typeof narration === "function" ? narration() : narration;
      return [];
    },
  };
}

export const run = (input = {}) => ({
  id: "music-1",
  tenant_id: TENANT,
  item_id: ITEM,
  stage_id: "st",
  input: { prompt: "restrained trailer", music_length_ms: 10_500, ...input },
  output: {},
});

export const narrationRow = (text = SCRIPT) => [
  {
    url: `${TENANT}/general/${ITEM}/narration/voice-1.audio`,
    meta: { text, alignment: ALIGNMENT },
  },
];

/** A music run's database: the film above, and the writes generateMusic makes. */
export function musicDb(r, extra = {}) {
  const inserts = [];
  return {
    inserts,
    ...filmDb({ narration: narrationRow(), ...extra }),
    async upload() {},
    async update(_table, _filter, patch) {
      r.output = patch.output;
    },
    async insert(table, row) {
      inserts.push([table, row]);
    },
  };
}

export const stubMusic = () => {
  const bodies = [];
  vi.stubGlobal("fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  });
  return bodies;
};
