import { assertNotStrictEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { providerMessageId, recipientVars } from "./recipient-vars.ts";

const row = {
  contact_name: "Dana Levi",
  email: "dana@example.com",
  phone: "0501234567",
  entity_type: "lead",
  vars: null,
};

Deno.test("recipientVars falls back to the recipient columns", () => {
  const vars = recipientVars(row);
  assertStrictEquals(vars.contact_name, "Dana Levi");
  assertStrictEquals(vars.email, "dana@example.com");
  assertStrictEquals(vars.phone, "0501234567");
});

Deno.test("recipientVars hides the phone of WhatsApp groups", () => {
  assertNotStrictEquals(
    recipientVars({ ...row, entity_type: "wa_group" }).phone,
    "0501234567",
  );
});

Deno.test("recipientVars lets stored vars win and stringifies them", () => {
  const vars = recipientVars({
    ...row,
    vars: { contact_name: "Dana", visits: 3, missing: null, ok: true },
  });
  assertStrictEquals(vars.contact_name, "Dana");
  assertStrictEquals(vars.visits, "3");
  assertStrictEquals(vars.missing, "");
  assertStrictEquals(vars.ok, "true");
});

Deno.test("providerMessageId reads a non-empty id as text", () => {
  assertStrictEquals(providerMessageId({ id: "m1" }, "id"), "m1");
  assertStrictEquals(providerMessageId({ idMessage: 42 }, "idMessage"), "42");
  assertStrictEquals(providerMessageId({ id: "" }, "id"), undefined);
  assertStrictEquals(providerMessageId(null, "id"), undefined);
  assertStrictEquals(providerMessageId(["m1"], "0"), undefined);
});

Deno.test("recipientVars ignores a text vars snapshot", () => {
  const vars = recipientVars({ ...row, vars: "contact_name=x" });
  assertStrictEquals(vars.contact_name, "Dana Levi");
});
