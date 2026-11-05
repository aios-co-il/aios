import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

const png = Uint8Array.from([137, 80, 78, 71]);

Deno.test(
  "references that cannot be read are reported, not skipped",
  async () => {
    const { loadReferences } = await import("./image-bytes.ts");
    const result = await loadReferences(
      ["https://x/ok.png", "https://x/gone.png", "https://x/page.html"],
      (async (url: string) =>
        url.endsWith("ok.png")
          ? new Response(png, { headers: { "content-type": "image/png" } })
          : url.endsWith("gone.png")
            ? new Response("", { status: 404 })
            : new Response("<html>", {
                headers: { "content-type": "text/html" },
              })) as unknown as typeof fetch,
    );
    assertStrictEquals(result.references.length, 1);
    assertStrictEquals(result.references[0].mime, "image/png");
    assertEquals(result.failed.sort(), [
      "https://x/gone.png",
      "https://x/page.html",
    ]);
  },
);
