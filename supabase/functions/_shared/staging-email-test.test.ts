import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  emailTestSendAllowed,
  isResendSend,
  parseTestEmails,
} from "./staging-email-test.ts";
import { installStagingOutboundGuard } from "./staging-outbound.mjs";

const allowed = parseTestEmails(" Me@Test.co, qa@test.co ; bad-value");
const send = (body: unknown, url = "https://api.resend.com/emails") =>
  emailTestSendAllowed(
    url,
    { method: "POST", body: JSON.stringify(body) },
    allowed,
  );

Deno.test("parses the allow list", () => {
  assertEquals(allowed, ["me@test.co", "qa@test.co"]);
});

Deno.test("only the single Resend send endpoint qualifies", () => {
  assertStrictEquals(
    isResendSend("https://api.resend.com/emails", "POST"),
    true,
  );
  assertStrictEquals(
    isResendSend("https://api.resend.com/emails/batch", "POST"),
    false,
  );
  assertStrictEquals(
    isResendSend("https://api.resend.com/domains", "POST"),
    false,
  );
  assertStrictEquals(
    isResendSend("https://api.resend.com/emails", "GET"),
    false,
  );
});

Deno.test("allows sends where every recipient is on the list", async () => {
  assertStrictEquals(await send({ to: ["me@test.co"] }), true);
  assertStrictEquals(
    await send({ to: "Me <ME@test.co>", cc: ["qa@test.co"] }),
    true,
  );
});

Deno.test("blocks any outside recipient, empty or odd payloads", async () => {
  assertStrictEquals(
    await send({ to: ["me@test.co", "client@real.com"] }),
    false,
  );
  assertStrictEquals(
    await send({ to: ["me@test.co"], bcc: "x@real.com" }),
    false,
  );
  assertStrictEquals(await send({ to: [] }), false);
  assertStrictEquals(await send({ to: { a: 1 } }), false);
  assertStrictEquals(await send([{ to: "me@test.co" }]), false);
  assertStrictEquals(
    await send({ to: ["me@test.co"] }, "https://api.resend.com/emails/batch"),
    false,
  );
  assertStrictEquals(
    await emailTestSendAllowed(
      "https://api.resend.com/emails",
      { method: "POST", body: JSON.stringify({ to: "me@test.co" }) },
      [],
    ),
    false,
  );
});

Deno.test(
  "guard lets an allowed email through and blocks the rest",
  async () => {
    const calls: string[] = [];
    const runtime = {
      fetch: async (input: RequestInfo | URL) => {
        calls.push(String(input));
        return new Response("{}", { status: 200 });
      },
    };
    installStagingOutboundGuard(
      "https://staging.supabase.co",
      runtime,
      [],
      ["me@test.co"],
    );
    const ok = await runtime.fetch("https://api.resend.com/emails", {
      method: "POST",
      body: JSON.stringify({ to: ["me@test.co"] }),
    });
    const blocked = await runtime.fetch("https://api.resend.com/emails", {
      method: "POST",
      body: JSON.stringify({ to: ["client@real.com"] }),
    });
    assertStrictEquals(ok.status, 200);
    assertStrictEquals(blocked.status, 409);
    assertStrictEquals(calls.length, 1);
  },
);
