import { assert, assertEquals } from "jsr:@std/assert@1";

/** A source file of the functions folder, as text. */
function source(path: string): string {
  return Deno.readTextFileSync(new URL(`../../../${path}`, import.meta.url));
}

/** How many times `needle` occurs in `text`. */
function count(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

const carmen = source("_shared/carmen.ts");

// These steps read the handlers as text, as run-ai-agent/attachments/wiring.test.ts does:
// the webhooks and handleCarmenMessage are too large to run with fakes here (AIO-123).
// Each rule itself is tested beside its module.
Deno.test("WhatsApp pictures are wired only into Carmen's turn", async (t) => {
  await t.step(
    "each webhook hands its picture only to handleCarmenMessage",
    () => {
      for (const [webhook, maker, calls] of [
        ["green-api-webhook/index.ts", "greenApiPicture(", 1],
        ["manus-wa-webhook/index.ts", "manusPicture(", 2],
        ["meta-whatsapp-webhook/index.ts", "metaPicture(", 1],
      ] as const) {
        const text = source(webhook);

        assertEquals(count(text, "handleCarmenMessage({"), calls, webhook);
        assertEquals(count(text, `picture: ${maker}`), calls, webhook);
        assertEquals(count(text, maker), calls, webhook);
      }
    },
  );

  await t.step(
    "handleCarmenMessage reads the picture only around the brain's call",
    () => {
      assertEquals(count(carmen, "ctx.picture"), 3);
      assertEquals(count(carmen, "withInboundPicture(\n"), 2);
      for (const call of carmen.split("withInboundPicture(\n").slice(1)) {
        const wrapped = call.slice(0, call.indexOf("\n    );"));

        assert(wrapped.includes("ctx.picture,"));
        assert(wrapped.includes("runCarmenAI("));
        assert(wrapped.includes("picture.attachments,"));
        assert(wrapped.includes("picture.note +"));
      }
    },
  );

  await t.step(
    "runCarmenAI sends the stored path as the attachments field",
    () => {
      assert(
        carmen.includes("...(attachments.length > 0 ? { attachments } : {}),"),
      );
    },
  );
});

Deno.test("the picture code sends nothing and changes no allowlist", () => {
  const pictureCode = [
    "_shared/carmen/whatsapp-picture/bucket.ts",
    "_shared/carmen/whatsapp-picture/fetch.ts",
    "_shared/carmen/whatsapp-picture/media-host.ts",
    "_shared/carmen/whatsapp-picture/turn.ts",
    "green-api-webhook/inbound-picture.ts",
    "manus-wa-webhook/inbound-picture.ts",
    "meta-whatsapp-webhook/inbound-picture.ts",
  ];
  // Senders, send endpoints and the settings that decide who may wake Carmen.
  const forbidden = [
    /send[A-Z]\w*\(/,
    /routedSend/,
    /\/send/,
    /functions\.invoke/,
    /functions\/v1/,
    /allowed_group_ids/,
    /private_phones/,
    /carmen_access_policies/,
    /carmen_whatsapp_identities/,
    /carmen_client_group_access/,
    /allowedPhones/,
    /\.insert\(|\.update\(|\.upsert\(/,
  ];

  for (const path of pictureCode) {
    const text = source(path);
    for (const pattern of forbidden) {
      assert(!pattern.test(text), `${path} matches ${pattern}`);
    }
  }
});
