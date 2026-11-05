import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  bareProject,
  type SavedBrief,
} from "./test-fakes.ts";

interface GateReply {
  needs_input?: boolean;
  missing?: Array<string>;
  say_to_user: string;
  carmen_next: string;
  success?: boolean;
}

/** The project as the last call saved it, to load in the next call. */
const projectSavedBy = (db: ReturnType<typeof fakeDb>) => {
  const saved = db.calls.filter((c) => c.op === "update").at(-1)
    ?.value as SavedBrief;
  return {
    ...bareProject(),
    "marketing_work_items:select": {
      id: "item-1",
      title: "",
      client_id: "client-1",
      current_stage_id: "stage-1",
      payload: saved.payload,
    },
  };
};

const questionLabels = (say: string) =>
  [...say.matchAll(/\[\[בחירה: ([^|]+?) \|/g)].map((m) => m[1]);

Deno.test(
  "what the request already says is never asked: Carmen reads it before the first questions",
  async () => {
    // David on Staging: he asked for motion graphics with narration and was still asked the look.
    const deps = {
      turnId: "turn-1",
      userText: "בואי נעשה סרטון מושן גרפיקס מגניב עם קריינות על המוצר",
    };
    const storyboard = {
      item_id: "item-1",
      scenes: [{ visual_prompt: "a phone on a desk" }],
    };
    const first = fakeDb(bareProject());
    const reading = (await executeApprovedWorkshopTool(
      first,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      deps,
    )) as GateReply;
    // Nothing reaches the user yet: Carmen is asked what the request settles.
    assertStrictEquals(reading.needs_input, true);
    assertStrictEquals(reading.say_to_user, "");
    assertMatch(reading.carmen_next, /brief_answers/);
    assertMatch(reading.carmen_next, /מראה/);

    const second = fakeDb(projectSavedBy(first));
    const asked = (await executeApprovedWorkshopTool(
      second,
      "tenant-1",
      "workshop_storyboard",
      { ...storyboard, brief_answers: { מראה: "מושן גרפיקס" } },
      async () => {},
      null,
      deps,
    )) as GateReply;
    // "עם קריינות" does not say who narrates, so the voice stays open; the look is never asked.
    assertEquals(questionLabels(asked.say_to_user), [
      "דמות",
      "צבעים",
      "קצב",
      "קול",
      "מוזיקה",
      "סיום",
    ]);
    assertNotMatch(asked.say_to_user, /מושן גרפיקס/);
  },
);

Deno.test(
  "a reference given in the message skips the style questions and the offer to attach one",
  async () => {
    const deps = {
      turnId: "turn-1",
      userText:
        "תעשי סרטון כמו המודעה הזו\n\n📎 קבצים מצורפים (1):\n- תמונה: ad.png → https://files.example.com/ad.png",
    };
    const storyboard = {
      item_id: "item-1",
      scenes: [{ visual_prompt: "a phone on a desk" }],
    };
    const first = fakeDb(bareProject());
    const reading = (await executeApprovedWorkshopTool(
      first,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      deps,
    )) as GateReply;
    assertEquals(reading.missing, ["film"]);
    assertStrictEquals(reading.say_to_user, "");

    // Carmen calls again without brief_answers: the flow does not loop, it asks what is open.
    const second = fakeDb(projectSavedBy(first));
    const asked = (await executeApprovedWorkshopTool(
      second,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      deps,
    )) as GateReply;
    assertEquals(questionLabels(asked.say_to_user), [
      "קצב",
      "קול",
      "מוזיקה",
      "סיום",
    ]);
    assertNotMatch(asked.say_to_user, /רפרנס/);
    const saved = second.calls.filter((c) => c.op === "update").at(-1)
      ?.value as SavedBrief;
    assertStrictEquals(
      saved.payload.workshop_brief.answers["רפרנס"],
      "תמונה שצורפה: ad.png",
    );
    assertStrictEquals(saved.payload.workshop_brief.asked, true);
    // The picture is the look: it is kept with the project's reference pictures.
    assertEquals(saved.payload.workshop_look?.references, [
      "https://files.example.com/ad.png",
    ]);
  },
);

Deno.test(
  "a site link in the message is not a look: the style questions stay open",
  async () => {
    const reading = (await executeApprovedWorkshopTool(
      fakeDb(bareProject()),
      "tenant-1",
      "workshop_storyboard",
      { item_id: "item-1", scenes: [{ visual_prompt: "a phone on a desk" }] },
      async () => {},
      null,
      { turnId: "turn-1", userText: "סרטון לעסק שלי https://shop.example.com" },
    )) as GateReply;
    assertEquals(reading.missing, ["style", "film"]);
  },
);

Deno.test(
  "a reference video asks the user nothing about the style: Carmen writes the bible from it",
  async () => {
    const deps = {
      turnId: "turn-1",
      userText: "סרטון בסגנון הזה https://cdn.example.com/ref.mp4",
    };
    const storyboard = {
      item_id: "item-1",
      scenes: [{ visual_prompt: "a phone on a desk" }],
    };
    const first = fakeDb(bareProject());
    const reading = (await executeApprovedWorkshopTool(
      first,
      "tenant-1",
      "workshop_storyboard",
      storyboard,
      async () => {},
      null,
      deps,
    )) as GateReply;
    assertStrictEquals(reading.say_to_user, "");
    assertNotMatch(reading.carmen_next, /מראה \(/);

    // Her reading of the video settles the film; the style is hers to write, not a question.
    const filmAnswers = {
      קצב: "אנרגטי ומהיר",
      קול: "קריינית",
      מוזיקה: "אלקטרונית קצבית",
      סיום: "לוגו בלבד",
    };
    const second = fakeDb(projectSavedBy(first));
    const toWrite = (await executeApprovedWorkshopTool(
      second,
      "tenant-1",
      "workshop_storyboard",
      { ...storyboard, brief_answers: filmAnswers },
      async () => {},
      null,
      deps,
    )) as GateReply;
    assertEquals(toWrite.missing, ["style"]);
    assertStrictEquals(toWrite.say_to_user, "");
    assertMatch(toWrite.carmen_next, /style_bible/);
    assertMatch(toWrite.carmen_next, /ref\.mp4/);
    const saved = second.calls.filter((c) => c.op === "update").at(-1)
      ?.value as SavedBrief;
    // A video is not a picture reference: the stills cannot be made from it.
    assertEquals(saved.payload.workshop_look?.references ?? [], []);

    const third = fakeDb(projectSavedBy(second));
    const written = (await executeApprovedWorkshopTool(
      third,
      "tenant-1",
      "workshop_storyboard",
      {
        ...storyboard,
        style_bible: "fast kinetic motion graphics, bold teal and white",
        style_approved: true,
        // The film's concept is settled too, so the scenes can be written in this call.
        brief_answers: { קונספט: "קליפ מהיר לפי הרפרנס" },
        skip_script: true,
      },
      async () => {},
      null,
      // The user named that concept in their own words (concept-choice.ts).
      { ...deps, userText: "קליפ מהיר לפי הרפרנס" },
    )) as GateReply;
    assertStrictEquals(written.needs_input, undefined);
    assertStrictEquals(written.success, true);
  },
);
