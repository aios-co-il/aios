import assert from "node:assert/strict";
import { test } from "node:test";
import { findVoice, HEBREW_VOICES, voiceMenu } from "./voices.ts";

test("a voice is found by id, Hebrew name, English name or a tap", () => {
  assert.equal(findVoice("d4eLZ8u5dfBCsjp4YPyz")?.name, "יעל");
  assert.equal(findVoice("נמרוד")?.id, "ZiofZHcEBTn5sRySe5h8");
  assert.equal(findVoice("itamar")?.name, "איתמר");
  assert.equal(findVoice("סתם"), null);
});

test("the menu lists every voice with buttons per gender, at most six each", () => {
  const menu = voiceMenu();
  for (const voice of HEBREW_VOICES) assert.match(menu, new RegExp(voice.name));
  assert.match(menu, /\[\[בחירה: קריינית \| יעל \| תמר \| זינה\]\]/);
  const male = menu.match(/\[\[בחירה: קריין \|([^\]]*)\]\]/)?.[1] ?? "";
  assert.equal(male.split("|").length, 5);
  assert.doesNotMatch(voiceMenu("female"), /נמרוד/);
});

test("only voices that produced a sample are offered when some did", () => {
  const menu = voiceMenu("female", new Set(["d4eLZ8u5dfBCsjp4YPyz"]));
  assert.match(menu, /יעל/);
  assert.doesNotMatch(menu, /תמר/);
});

test("Carmen's guess of a gender does not hide voices the user did not rule out", async () => {
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
  assert.match(String(open.say_to_user), /נמרוד/);
  const asked = await chooseVoice(
    { gender: "female" },
    helpers("אני רוצה קריינית"),
  );
  assert.doesNotMatch(String(asked.say_to_user), /נמרוד/);
});

test("the narration voice is a real voice id, never a board page id", async () => {
  const { narrationVoiceId } = await import("./voices.ts");
  const zina = "Tbj9UQjXon5RB9MPEyc2";
  assert.equal(
    narrationVoiceId("fefeda21-4607-44d1-894d-0e54a1802df8", zina),
    zina,
  );
  assert.equal(narrationVoiceId("יעל", zina), "d4eLZ8u5dfBCsjp4YPyz");
  assert.equal(
    narrationVoiceId("AbCdEfGhIjKlMnOpQrSt", zina),
    "AbCdEfGhIjKlMnOpQrSt",
  );
  assert.equal(narrationVoiceId(undefined, null), null);
});
