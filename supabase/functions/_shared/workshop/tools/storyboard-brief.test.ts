import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  project,
  scene,
  bareProject,
} from "./test-fakes.ts";
import { afterReading } from "./test-briefing.ts";

Deno.test(
  "without a defined style Carmen gets questions instead of pictures, storyboard included",
  async () => {
    let generated = 0;
    const deps = {
      generateImage: async () => {
        generated += 1;
        return { image_url: "https://x/1.png" };
      },
    };
    for (const [name, extra] of [
      ["workshop_make_stills", {}],
      ["workshop_storyboard", { scenes: [{ visual_prompt: "a woman" }] }],
    ] as const) {
      const { reading, db, result } = await afterReading(
        { ...bareProject(), "marketing_video_scenes:select": [scene("s-1")] },
        name,
        { item_id: "item-1", confirmed: true, ...extra },
        deps,
      );
      assertStrictEquals(reading.say_to_user, "", name);
      assertStrictEquals(result.needs_input, true, name);
      assertEquals(result.missing, ["style", "film"]);
      assertStrictEquals(result.say_to_user.match(/\[\[בחירה:/g)?.length, 7);
      assertStrictEquals("message" in result, false);
      // Nothing is made; the project only remembers that the questions were shown.
      assertStrictEquals(
        db.calls.some((c) => c.op === "rpc"),
        false,
      );
      const updates = db.calls.filter((c) => c.op === "update");
      assertStrictEquals(updates.length, 1);
      assertStrictEquals(
        (updates[0].value as any).payload.workshop_brief.asked,
        true,
      );
    }
    assertStrictEquals(generated, 0);
  },
);

Deno.test(
  "a tapped answer and the user's own additions enter the brief Carmen reads and the board shows",
  async () => {
    // Staging: Carmen said "נרשם לבריף" but the brief stayed the first request.
    const request = "סרטון לכרמן שמציג את הסקינים שלה";
    const first = fakeDb({
      ...bareProject(),
      "marketing_work_items:select": {
        id: "item-1",
        title: "",
        client_id: "client-1",
        current_stage_id: "stage-1",
        payload: { format: "9:16", project_type: "video", brief_text: request },
      },
      "workshop_artifacts:select": [
        { id: "brief-page", meta: { summary: "סרט 9:16", brief: request } },
      ],
    });
    await executeApprovedWorkshopTool(
      first,
      "tenant-1",
      "workshop_storyboard",
      {
        item_id: "item-1",
        scenes: [{ visual_prompt: "a woman" }],
        brief_answers: {
          סגנון: "מושן גרפיקס",
          פונט: "Heebo, טקסט גדול",
        },
      },
      async () => {},
      null,
      {
        lastAssistant: "[[בחירה: קצב | רגוע | מהיר]]",
        userText: "מהיר",
      },
    );
    const saved = (
      first.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .pop()?.value as { payload: Record<string, unknown> }
    ).payload;
    const page = first.calls.find(
      (c) => c.table === "workshop_artifacts" && c.op === "update",
    )?.value as { meta: Record<string, unknown> };
    const second = fakeDb({
      ...project,
      "marketing_work_items:select": { id: "item-1", payload: saved },
    });
    const state = (await executeApprovedWorkshopTool(
      second,
      "tenant-1",
      "workshop_get_state",
      { item_id: "item-1" },
    )) as { brief: string };
    assertStrictEquals(saved.brief_text, request);
    assert(state.brief.startsWith(`${request}\n\nפרטים שנוספו לבריף:`));
    for (const line of [
      "קצב: מהיר",
      "סגנון: מושן גרפיקס",
      "פונט: Heebo, טקסט גדול",
    ]) {
      assert(state.brief.includes(line), line);
    }
    assertEquals(page.meta, { summary: "סרט 9:16", brief: state.brief });
  },
);

Deno.test(
  "questions Carmen already asked with her own buttons are not asked again by the storyboard",
  async () => {
    // David's run: Carmen asked her own buttons, he tapped all three, then she wrote the storyboard.
    const carmenAsked = [
      "לפני שנתחיל, כמה בחירות:",
      "[[בחירה: סגנון חזותי | קולנועי ריאליסטי | אנימציית תלת־ממד | איור מונפש]]",
      "[[בחירה: מוזיקה | אלקטרונית קצבית | אקוסטית חמה | בלי מוזיקה]]",
      "[[בחירה: סגיר | לוגו וקריאה לפעולה | לוגו בלבד | בלי סגיר]]",
    ].join("\n");
    const tapped =
      "סגנון חזותי: קולנועי ריאליסטי\nמוזיקה: אקוסטית חמה\nסגיר: לוגו וקריאה לפעולה";
    const storyboard = {
      item_id: "item-1",
      scenes: [{ visual_prompt: "a woman at a laptop" }],
    };
    const {
      reading,
      db: first,
      result: asked,
    } = await afterReading(bareProject(), "workshop_storyboard", storyboard, {
      userText: tapped,
      lastAssistant: carmenAsked,
    });
    // The taps are not a reading of the request: Carmen reads it first.
    assertStrictEquals(reading.reading, true);
    assertStrictEquals(asked.needs_input, true);
    const labels = [
      ...asked.say_to_user.matchAll(/\[\[בחירה: ([^|]+?) \|/g),
    ].map((match: RegExpMatchArray) => match[1]);
    // Each topic once: look, music and ending were answered under Carmen's own names.
    assertEquals(labels, ["דמות", "צבעים", "קצב", "קול"]);
    const saved = first.calls.find((c) => c.op === "update")?.value as any;
    assertEquals(saved.payload.workshop_brief.answers, {
      "סגנון חזותי": "קולנועי ריאליסטי",
      מוזיקה: "אקוסטית חמה",
      סגיר: "לוגו וקריאה לפעולה",
    });

    // He answers the rest and has chosen a concept, so the storyboard is written.
    const second = fakeDb({
      ...bareProject(),
      "marketing_work_items:select": {
        id: "item-1",
        title: "",
        client_id: "client-1",
        current_stage_id: "stage-1",
        payload: saved.payload,
      },
    });
    const written = (await executeApprovedWorkshopTool(
      second,
      "tenant-1",
      "workshop_storyboard",
      { ...storyboard, concept: "יום אחד", skip_script: true },
      async () => {},
      null,
      {
        userText:
          "דמות: דמות אחת קבועה\nצבעים: חם ומזמין\nקצב: רגוע ורגשי\nקול: קריינית",
        lastAssistant: asked.say_to_user,
      },
    )) as Record<string, any>;
    assertStrictEquals(written.needs_input, undefined);
    assertStrictEquals(written.success, true);
    assert(second.calls.some((c) => c.table === "rpc:save_video_storyboard"));
  },
);

Deno.test(
  "a first call carrying only tapped answers still reads the request, so its look is not asked",
  async () => {
    // Staging, 4 Nov: the concept and ending taps counted as reading the request, so the
    // "מושן גרפיקס" the request named was never recorded and the look was asked again.
    const { reading, result } = await afterReading(
      bareProject(),
      "workshop_storyboard",
      {
        item_id: "item-1",
        scenes: [{ visual_prompt: "kinetic type" }],
        brief_answers: { קונספט: "תחלופה", סגיר: "קחו את כרמן לשיווק שלכם" },
      },
      { userText: "סרטון מושן גרפיקס מגניב וזריז עם קריינות" },
      {
        brief_answers: {
          קונספט: "תחלופה",
          סגיר: "קחו את כרמן לשיווק שלכם",
          מראה: "מושן גרפיקס",
        },
      },
    );
    assertStrictEquals(reading.reading, true);
    assertStrictEquals(reading.say_to_user, "");
    assertStrictEquals(result.needs_input, true);
    const labels = [
      ...result.say_to_user.matchAll(/\[\[בחירה: ([^|]+?) \|/g),
    ].map((match) => match[1]);
    assert(labels.length > 0);
    assertEquals(
      labels.filter((label) => ["מראה", "סיום", "סגיר"].includes(label)),
      [],
    );
  },
);
