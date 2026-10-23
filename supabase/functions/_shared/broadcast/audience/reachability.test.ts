import assert from "node:assert/strict";
import test from "node:test";
import { fakeDb } from "../fake-db.ts";
import { isOptedOut } from "./reachability.ts";

const { db } = fakeDb({
  broadcast_opt_outs: [
    {
      id: "o1",
      tenant_id: "t1",
      phone: "972501234567",
      email: null,
      channel: "all",
    },
    {
      id: "o2",
      tenant_id: "t1",
      phone: null,
      email: "dana@example.com",
      channel: "all",
    },
    {
      id: "o3",
      tenant_id: "t1",
      phone: "972509999999",
      email: null,
      channel: "email",
    },
  ],
});

test("a blacklisted phone is skipped on WhatsApp", async () => {
  assert.equal(
    await isOptedOut(db, "t1", "whatsapp", { phone: "050-123-4567" }),
    true,
  );
});

test("a blacklisted email is skipped on email, case-insensitively", async () => {
  assert.equal(
    await isOptedOut(db, "t1", "email", { email: "Dana@Example.com" }),
    true,
  );
});

test("an email-only opt-out does not block WhatsApp", async () => {
  assert.equal(
    await isOptedOut(db, "t1", "whatsapp", { phone: "0509999999" }),
    false,
  );
});

test("another tenant's blacklist does not apply", async () => {
  assert.equal(
    await isOptedOut(db, "t2", "whatsapp", { phone: "0501234567" }),
    false,
  );
});
