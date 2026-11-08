/** A film's rows for the loadFilmSources tests (narration.test.ts), answered by table and query. */
import type { SceneRow } from "../src/jobs/types.ts";

/** Answers loadFilmSources' reads from the table name and query. */
export function fakeDb({
  scenes,
  assets,
  narration,
}: {
  scenes: Array<SceneRow>;
  assets: Array<FakeAsset>;
  narration?: FakeAsset;
}) {
  return {
    async select(table: string, query: string) {
      if (table === "marketing_video_scenes") {
        return query.includes("clip_asset_id=not.is.null")
          ? scenes.filter((scene) => scene.clip_asset_id)
          : scenes;
      }
      if (query.includes("type=eq.narration")) {
        return narration ? [narration] : [];
      }
      if (query.includes("type=eq.music")) {
        return [];
      }
      return assets;
    },
  };
}

/** A marketing_assets row as the fake answers it; its meta is changed in place by the tests. */
export interface FakeAsset {
  id?: string;
  type?: string;
  url: string;
  meta: Record<string, unknown>;
}
