import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { generateStill } from "./image-providers.ts";

const png = Uint8Array.from([137, 80, 78, 71]);
const b64 = btoa(String.fromCharCode(...png));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

Deno.test(
  "OpenAI with references uses the edits endpoint with the pictures attached",
  async () => {
    const ref = { bytes: Uint8Array.from([255, 216, 1]), mime: "image/jpeg" };
    let url = "";
    let form: FormData | null = null;
    const made = await generateStill(
      { openai: "k" },
      "a cat",
      "9:16",
      {
        fetchImpl: (async (u: string, init: RequestInit) => {
          url = u;
          form = init.body as FormData;
          return json({ data: [{ b64_json: b64 }] });
        }) as typeof fetch,
      },
      [ref],
    );
    assertStrictEquals(made.provider, "openai");
    assertMatch(url, /images\/edits$/);
    assertStrictEquals(form!.getAll("image[]").length, 1);
    assertStrictEquals(form!.get("size"), "1024x1536");
  },
);
