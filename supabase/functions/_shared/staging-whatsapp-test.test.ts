import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  parseTestNumbers,
  whatsappTestSendAllowed,
} from "./staging-whatsapp-test.ts";
import { installStagingOutboundGuard } from "./staging-outbound.mjs";

const david = "972507677613";
const numbers = parseTestNumbers(`+${david}, 05`);
const green = "https://api.green-api.com/waInstance1101/sendMessage/tok";
const manus =
  "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/abc/send/text";
const meta = "https://graph.facebook.com/v21.0/123456/messages";
const post = (body: BodyInit): RequestInit => ({ method: "POST", body });
const chat = (chatId: string) => post(JSON.stringify({ chatId }));

Deno.test(
  "WhatsApp test sends reach only the configured direct chat",
  async () => {
    const form = new FormData();
    form.append("chatId", `${david}@c.us`);
    const allowed: [string | Request, RequestInit | undefined][] = [
      [green, chat(`${david}@c.us`)],
      [manus, post(JSON.stringify({ to: david, body: "hi" }))],
      [
        meta,
        post(
          JSON.stringify({ messaging_product: "whatsapp", to: `+${david}` }),
        ),
      ],
      [
        "https://api.green-api.com/waInstance1101/sendFileByUpload/tok",
        post(form),
      ],
      [
        "https://7103.media.greenapi.com/waInstance7103954455/sendFileByUpload/tok",
        chat(`${david}@c.us`),
      ],
      [new Request(green, chat(`${david}@c.us`)), undefined],
    ];
    for (const [input, init] of allowed) {
      assertStrictEquals(
        await whatsappTestSendAllowed(input, init, numbers),
        true,
      );
    }
    const blocked: [string, RequestInit][] = [
      [green, chat("972501234567@c.us")],
      [green, chat(`${david}-1600000000@g.us`)],
      [green, chat(`0${david.slice(3)}@c.us`)],
      [green, chat(`1${david}@c.us`)],
      [green, { method: "GET" }],
      [green, post("not json")],
      [`${green}?chatId=${david}`, chat(`${david}@c.us`)],
      [
        "https://api.green-api.com/waInstance1101/sendPoll/tok",
        chat(`${david}@c.us`),
      ],
      [
        "https://9999.media.greenapi.com/waInstance7103954455/sendFileByUpload/tok",
        chat(`${david}@c.us`),
      ],
      [
        "https://7103.media.greenapi.com/waInstance7103954455/sendMessage/tok",
        chat(`${david}@c.us`),
      ],
      [
        "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/abc/send/group",
        post(JSON.stringify({ to: david, groupId: "x@g.us" })),
      ],
      [manus, post(JSON.stringify({ to: [david, "972501234567"] }))],
      [meta, post(JSON.stringify({ to: "972501234567" }))],
      [
        "https://evil.example/waInstance1101/sendMessage/tok",
        chat(`${david}@c.us`),
      ],
    ];
    for (const [url, init] of blocked) {
      assertStrictEquals(
        await whatsappTestSendAllowed(url, init, numbers),
        false,
        url,
      );
    }
  },
);

Deno.test(
  "WhatsApp sends stay blocked when no test number is configured",
  async () => {
    assertStrictEquals(
      await whatsappTestSendAllowed(green, chat(`${david}@c.us`), []),
      false,
    );
    assertEquals(parseTestNumbers(undefined), []);
  },
);

Deno.test("installed guard lets only the test number through", async () => {
  const calls: unknown[] = [];
  const runtime = {
    fetch: (async (...args: unknown[]) => {
      calls.push(args);
      return new Response("{}");
    }) as typeof fetch,
  };
  installStagingOutboundGuard("https://staging.supabase.co", runtime, [david]);
  const ok = await runtime.fetch(green, chat(`${david}@c.us`));
  const no = await runtime.fetch(green, chat("972501234567@c.us"));
  assertStrictEquals(ok.status, 200);
  assertStrictEquals(no.status, 409);
  assertStrictEquals(calls.length, 1);
});
