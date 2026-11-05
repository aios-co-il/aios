import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { chooseVoice, type VoiceHelpers } from "./voice-tool.ts";
import { HEBREW_VOICES } from "./voices.ts";

/** Helpers that count the samples asked for and keep the saved voice. */
function helpers(auto: boolean) {
  const sampled: Array<string> = [];
  const saved: Array<string> = [];
  const fake: VoiceHelpers = {
    auto,
    userText: "",
    voiceSample: async (id) => {
      sampled.push(id);
      return { path: `voices/${id}.mp3` };
    },
    addSamplePage: async () => {},
    saveVoice: async (_id, name) => {
      saved.push(name);
    },
  };
  return { fake, sampled, saved };
}

Deno.test(
  "automatic mode: Carmen picks the voice, no samples, no question",
  async () => {
    const { fake, sampled } = helpers(true);
    const result = await chooseVoice({}, fake);
    assertStrictEquals(result.say_to_user, "");
    assertStrictEquals(result.carmen_continues, true);
    assertEquals(result.voices?.length, HEBREW_VOICES.length);
    assertMatch(String(result.carmen_next), /בחרי בעצמך/);
    assertStrictEquals(sampled.length, 0);
  },
);

Deno.test("a named voice is saved in either mode", async () => {
  for (const auto of [true, false]) {
    const { fake, saved } = helpers(auto);
    const result = await chooseVoice({ voice: "נמרוד" }, fake);
    assertStrictEquals(result.success, true);
    assertEquals(saved, ["נמרוד"]);
  }
});

Deno.test("semi-automatic: the user hears samples and picks", async () => {
  const { fake, sampled } = helpers(false);
  const result = await chooseVoice({}, fake);
  assertMatch(String(result.say_to_user), /\[\[בחירה: קריינית/);
  assertStrictEquals(sampled.length, HEBREW_VOICES.length);
});
