import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { findVoice, HEBREW_VOICES, voiceMenu } from "./voices.ts";

Deno.test("a voice is found by id, Hebrew name, English name or a tap", () => {
  assertStrictEquals(findVoice("d4eLZ8u5dfBCsjp4YPyz")?.name, "יעל");
  assertStrictEquals(findVoice("נמרוד")?.id, "ZiofZHcEBTn5sRySe5h8");
  assertStrictEquals(findVoice("itamar")?.name, "איתמר");
  assertStrictEquals(findVoice("סתם"), null);
});

Deno.test(
  "the menu lists every voice with buttons per gender, at most six each",
  () => {
    const menu = voiceMenu();
    for (const voice of HEBREW_VOICES)
      assertMatch(menu, new RegExp(voice.name));
    assertMatch(menu, /\[\[בחירה: קריינית \| יעל \| תמר \| זינה\]\]/);
    const male = menu.match(/\[\[בחירה: קריין \|([^\]]*)\]\]/)?.[1] ?? "";
    assertStrictEquals(male.split("|").length, 5);
    assertNotMatch(voiceMenu("female"), /נמרוד/);
  },
);

Deno.test(
  "only voices that produced a sample are offered when some did",
  () => {
    const menu = voiceMenu("female", new Set(["d4eLZ8u5dfBCsjp4YPyz"]));
    assertMatch(menu, /יעל/);
    assertNotMatch(menu, /תמר/);
  },
);

Deno.test(
  "Carmen's guess of a gender does not hide voices the user did not rule out",
  async () => {
    const { chooseVoice } = await import("./voice-tool.ts");
    const helpers = (userText: string | null) => ({
      voiceSample: async (id: string) => ({ path: `voices/${id}.mp3` }),
      addSamplePage: async () => {},
      saveVoice: async () => {},
      userText,
    });
    const open = await chooseVoice(
      { gender: "female" },
      helpers("תערכי לי סרטון מהחומרים"),
    );
    assertMatch(String(open.say_to_user), /נמרוד/);
    const asked = await chooseVoice(
      { gender: "female" },
      helpers("אני רוצה קריינית"),
    );
    assertNotMatch(String(asked.say_to_user), /נמרוד/);
  },
);

Deno.test(
  "the narration voice is a real voice id, never a board page id",
  async () => {
    const { narrationVoiceId } = await import("./voices.ts");
    const zina = "Tbj9UQjXon5RB9MPEyc2";
    assertStrictEquals(
      narrationVoiceId("fefeda21-4607-44d1-894d-0e54a1802df8", zina),
      zina,
    );
    assertStrictEquals(narrationVoiceId("יעל", zina), "d4eLZ8u5dfBCsjp4YPyz");
    assertStrictEquals(
      narrationVoiceId("AbCdEfGhIjKlMnOpQrSt", zina),
      "AbCdEfGhIjKlMnOpQrSt",
    );
    assertStrictEquals(narrationVoiceId(undefined, null), null);
  },
);
