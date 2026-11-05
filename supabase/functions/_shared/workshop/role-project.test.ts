import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  workshopArtifactIdFrom,
  workshopItemIdFrom,
  workshopProjectKind,
  workshopSceneIdFrom,
} from "./role-project.ts";

const ID = "0f8b5a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const SCENE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

Deno.test(
  "the open project id comes from the body or the workshop context line",
  () => {
    assertStrictEquals(workshopItemIdFrom({ workshop_item_id: ID }), ID);
    assertStrictEquals(
      workshopItemIdFrom({
        system_prompt_addon: `=== הסדנה של כרמן ===\nפרויקט פתוח: item_id=${ID} (סרטון)`,
      }),
      ID,
    );
    assertStrictEquals(
      workshopItemIdFrom({ system_prompt_addon: "אין פרויקט פתוח." }),
      null,
    );
  },
);

Deno.test(
  "the marked page comes from the body or the workshop context line",
  () => {
    const ART = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
    assertStrictEquals(
      workshopArtifactIdFrom({ workshop_artifact_id: ART }),
      ART,
    );
    assertStrictEquals(
      workshopArtifactIdFrom({
        system_prompt_addon: `פרויקט פתוח: item_id=${ID}\nהעמוד שהמשתמש בחר בלוח: artifact_id=${ART}.`,
      }),
      ART,
    );
    assertStrictEquals(
      workshopArtifactIdFrom({
        system_prompt_addon: `פרויקט פתוח: item_id=${ID}`,
      }),
      null,
    );
  },
);

Deno.test("the picked scene comes from the workshop context line", () => {
  assertStrictEquals(
    workshopSceneIdFrom({
      system_prompt_addon: `פרויקט פתוח: item_id=${ID}\nהסצנה שהמשתמש בחר בלוח: scene_id=${SCENE} (סצנה 3).`,
    }),
    SCENE,
  );
  assertStrictEquals(
    workshopSceneIdFrom({ system_prompt_addon: `פרויקט פתוח: item_id=${ID}` }),
    null,
  );
  assertStrictEquals(workshopSceneIdFrom({}), null);
});

/** The project row, and its scenes (`scenes` rows in marketing_video_scenes). */
const projectDb = (payload: Record<string, unknown>, scenes = 0) => ({
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { payload } }),
      limit: () =>
        Promise.resolve({
          data:
            table === "marketing_video_scenes"
              ? Array.from({ length: scenes }, (_, i) => ({ id: `s-${i}` }))
              : [],
          error: null,
        }),
    };
    return query;
  },
});

Deno.test("a picked scene counts only in a film project", async () => {
  assertEquals(
    await workshopProjectKind(
      projectDb({ project_type: "video", workshop_edit: true }),
      "tenant",
      ID,
      SCENE,
    ),
    { video: true, edit: true, scene: true },
  );
  assertEquals(
    await workshopProjectKind(
      projectDb({ project_type: "video" }, 3),
      "tenant",
      ID,
      null,
    ),
    { video: true, edit: false },
  );
  assertEquals(await workshopProjectKind(projectDb({}), "tenant", ID, SCENE), {
    video: false,
    edit: false,
  });
});

Deno.test(
  "a film with no scenes and no approved script is being written",
  async () => {
    const kind = (payload: Record<string, unknown>, scenes = 0) =>
      workshopProjectKind(projectDb(payload, scenes), "tenant", ID, null);
    const film = { project_type: "video" };
    assertEquals(await kind(film), { video: true, edit: false, writing: true });
    const waiting = {
      ...film,
      workshop_script: {
        artifact_id: "script-1",
        beats: [{ start_s: 0, end_s: 3, narration: "שלום" }],
        approved: false,
      },
    };
    assertEquals((await kind(waiting))?.writing, true);
    // Approved or skipped, or a film that already has scenes: the producer's.
    const approved = {
      ...waiting,
      workshop_script: { ...waiting.workshop_script, approved: true },
    };
    assertEquals((await kind(approved))?.writing, undefined);
    assertEquals(
      (await kind({ ...film, workshop_script: { skipped: true } }))?.writing,
      undefined,
    );
    assertEquals((await kind(film, 2))?.writing, undefined);
    // A film cut from the user's materials stays with the editor.
    assertEquals(
      (await kind({ ...film, workshop_edit: true }))?.writing,
      undefined,
    );
  },
);
