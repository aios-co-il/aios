import assert from "node:assert/strict";
import test from "node:test";
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

test("parses the allow list", () => {
  assert.deepEqual(allowed, ["me@test.co", "qa@test.co"]);
});

test("only the single Resend send endpoint qualifies", () => {
  assert.equal(isResendSend("https://api.resend.com/emails", "POST"), true);
  assert.equal(
    isResendSend("https://api.resend.com/emails/batch", "POST"),
    false,
  );
  assert.equal(isResendSend("https://api.resend.com/domains", "POST"), false);
  assert.equal(isResendSend("https://api.resend.com/emails", "GET"), false);
});

test("allows sends where every recipient is on the list", async () => {
  assert.equal(await send({ to: ["me@test.co"] }), true);
  assert.equal(await send({ to: "Me <ME@test.co>", cc: ["qa@test.co"] }), true);
});

test("blocks any outside recipient, empty or odd payloads", async () => {
  assert.equal(await send({ to: ["me@test.co", "client@real.com"] }), false);
  assert.equal(await send({ to: ["me@test.co"], bcc: "x@real.com" }), false);
  assert.equal(await send({ to: [] }), false);
  assert.equal(await send({ to: { a: 1 } }), false);
  assert.equal(await send([{ to: "me@test.co" }]), false);
  assert.equal(
    await send({ to: ["me@test.co"] }, "https://api.resend.com/emails/batch"),
    false,
  );
  assert.equal(
    await emailTestSendAllowed(
      "https://api.resend.com/emails",
      { method: "POST", body: JSON.stringify({ to: "me@test.co" }) },
      [],
    ),
    false,
  );
});

test("guard lets an allowed email through and blocks the rest", async () => {
  const calls: string[] = [];
  const runtime = {
    fetch: async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("{}", { status: 200 });
    },
  } as unknown as typeof globalThis;
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
  assert.equal(ok.status, 200);
  assert.equal(blocked.status, 409);
  assert.equal(calls.length, 1);
});
