import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { generateOpenRouterImage } from "./openrouterImage.ts";

Deno.test(
  "OpenRouter images come back as base64 with the model used",
  async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({
          data: [{ b64_json: "aGk=", media_type: "image/webp" }],
          usage: { cost: 0.04 },
        }),
      );
    }) as typeof fetch;
    const out = await generateOpenRouterImage({
      apiKey: "sk-or",
      prompt: "p",
      aspectRatio: "9:16",
      fetchImpl,
    });
    assertStrictEquals(body.aspect_ratio, "9:16");
    assertStrictEquals(body.model, "google/gemini-3.1-flash-image");
    assertEquals(out, {
      b64: "aGk=",
      mediaType: "image/webp",
      model: "google/gemini-3.1-flash-image",
      usd: 0.04,
    });
  },
);

Deno.test(
  "reference pictures go in input_references as data URLs",
  async () => {
    let body: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: [{ b64_json: "aGk=" }] }));
    }) as typeof fetch;
    await generateOpenRouterImage({
      apiKey: "k",
      prompt: "p",
      references: [{ bytes: new Uint8Array([104, 105]), mime: "image/png" }],
      fetchImpl,
    });
    assertEquals(body.input_references, [
      { type: "image_url", image_url: { url: "data:image/png;base64,aGk=" } },
    ]);
  },
);

Deno.test(
  "an OpenRouter error is thrown, so the caller can fall back",
  async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: "no" } }), {
        status: 502,
      })) as typeof fetch;
    await assertRejects(
      () => generateOpenRouterImage({ apiKey: "k", prompt: "p", fetchImpl }),
      Error,
      "OpenRouter image 502",
    );
  },
);
