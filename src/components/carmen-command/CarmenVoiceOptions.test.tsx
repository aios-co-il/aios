import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CARMEN_VOICES } from "../../../supabase/functions/carmen-realtime-session/voice-list.ts";
import { CarmenVoiceOptions } from "./CarmenVoiceOptions";
import { DEFAULT_VOICE_LABEL } from "./carmenVoices";

describe("CarmenVoiceOptions", () => {
  it("offers Carmen's default, then every voice of the server's list in order", () => {
    render(
      <select aria-label="voice">
        <CarmenVoiceOptions />
      </select>,
    );

    const options = screen.getAllByRole<HTMLOptionElement>("option");

    expect(options.map((option) => [option.value, option.text])).toEqual([
      ["", DEFAULT_VOICE_LABEL],
      ...CARMEN_VOICES.map((voice) => [voice.id, voice.label]),
    ]);
  });

  it("puts each provider's voices under its own heading", () => {
    render(
      <select aria-label="voice">
        <CarmenVoiceOptions />
      </select>,
    );

    const groups = screen.getAllByRole<HTMLOptGroupElement>("group");

    expect(groups.map((group) => group.label)).toEqual([
      "ElevenLabs",
      "OpenAI",
    ]);
    expect(
      within(groups[0])
        .getAllByRole<HTMLOptionElement>("option")
        .map((option) => option.value),
    ).toEqual(
      CARMEN_VOICES.filter((voice) => voice.provider === "elevenlabs").map(
        (voice) => voice.id,
      ),
    );
  });
});
