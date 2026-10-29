import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { pictureFromEngines, type PictureDeps } from "./picture-engines.ts";
import type { ImageReference } from "../workshop/image-providers.ts";

const anchor: ImageReference = {
  bytes: new Uint8Array([0x89, 0x50, 1]),
  mime: "image/png",
  url: "https://x/anchor.png",
};
const stillFailed = () =>
  Promise.reject(
    new Error(
      "יצירת התמונה נכשלה בכל הספקים המחוברים. ElevenLabs: מפתח ה-ElevenLabs לא תקין | OpenAI: 401",
    ),
  );

function recorder(openRouterFails: number[] = []) {
  const openRouterCalls: { refs: number; prompt: string }[] = [];
  let stillCalls = 0;
  const deps: PictureDeps = {
    openRouter: (args) => {
      openRouterCalls.push({
        refs: args.references?.length ?? 0,
        prompt: args.prompt,
      });
      const status = openRouterFails[openRouterCalls.length - 1];
      if (status)
        return Promise.reject(new Error(`OpenRouter image ${status}: no`));
      return Promise.resolve({
        b64: "aGk=",
        mediaType: "image/png",
        model: "google/gemini-3.1-flash-image",
        usd: 0.04,
      });
    },
    still: () => {
      stillCalls++;
      return stillFailed();
    },
  };
  return { deps, openRouterCalls, stills: () => stillCalls };
}

const base = {
  openRouterKey: "sk-or",
  keys: { openai: "bad", elevenlabs: "bad" },
  otherEngines: true,
  prompt: "scene 2, same character",
  aspectRatio: "9:16",
};

Deno.test(
  "a referenced scene still goes to OpenRouter with its references",
  async () => {
    const { deps, openRouterCalls, stills } = recorder();
    const made = await pictureFromEngines(
      { ...base, references: [anchor, anchor] },
      deps,
    );
    assertEquals(made.provider, "openrouter/google/gemini-3.1-flash-image");
    assertEquals(openRouterCalls, [
      { refs: 2, prompt: "scene 2, same character" },
    ]);
    assertEquals(stills(), 0);
  },
);

Deno.test(
  "OpenRouter refusing the references is retried from the prompt after the engines fail",
  async () => {
    const { deps, openRouterCalls, stills } = recorder([400]);
    const made = await pictureFromEngines(
      { ...base, references: [anchor] },
      deps,
    );
    assertEquals(made.provider, "openrouter/google/gemini-3.1-flash-image");
    assertEquals(stills(), 1);
    assertEquals(
      openRouterCalls.map((call) => call.refs),
      [1, 0],
    );
  },
);

Deno.test("a pinned engine that fails falls back to OpenRouter", async () => {
  const { deps, openRouterCalls } = recorder();
  const made = await pictureFromEngines(
    { ...base, engine: "elevenlabs", references: [anchor] },
    deps,
  );
  assertEquals(made.provider, "openrouter/google/gemini-3.1-flash-image");
  assertEquals(openRouterCalls[0].refs, 1);
});

Deno.test(
  "when everything fails the user sees every engine's reason",
  async () => {
    const { deps, openRouterCalls } = recorder([401]);
    await assertRejects(
      () => pictureFromEngines({ ...base, references: [anchor] }, deps),
      Error,
      "יצירת התמונה נכשלה בכל הספקים המחוברים. OpenRouter: OpenRouter image 401: no | ElevenLabs: מפתח ה-ElevenLabs לא תקין | OpenAI: 401",
    );
    // A rejected OpenRouter key is not asked twice.
    assertEquals(openRouterCalls.length, 1);
  },
);

Deno.test(
  "a timed-out engine may already be charged, so OpenRouter is not tried after it",
  async () => {
    const { deps, openRouterCalls } = recorder();
    await assertRejects(
      () =>
        pictureFromEngines(
          { ...base, engine: "google", references: [] },
          {
            ...deps,
            still: () =>
              Promise.reject(new Error("Google (Gemini): לא ענה בזמן")),
          },
        ),
      Error,
      "לא ענה בזמן",
    );
    assertEquals(openRouterCalls.length, 0);
  },
);

Deno.test("without OpenRouter the engines' own error is kept", async () => {
  const { deps } = recorder();
  await assertRejects(
    () =>
      pictureFromEngines(
        { ...base, openRouterKey: "", references: [anchor] },
        deps,
      ),
    Error,
    "יצירת התמונה נכשלה בכל הספקים המחוברים. ElevenLabs",
  );
});
