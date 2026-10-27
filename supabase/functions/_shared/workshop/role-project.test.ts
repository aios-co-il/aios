import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
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

const projectDb = (payload: Record<string, unknown>) => ({
  from: () => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: () => Promise.resolve({ data: { payload } }),
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
      projectDb({ project_type: "video" }),
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
