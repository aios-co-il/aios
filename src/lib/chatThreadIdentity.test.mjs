import { expect, test } from "vitest";

import {
  buildChatThreadFilter,
  normalizeChatThreadPhone,
} from "./chatThreadIdentity.mjs";

test("normalizes common Israeli phone formats to one WhatsApp identity", () => {
  expect(normalizeChatThreadPhone("+972-50-767-7613")).toBe("507677613");
  expect(normalizeChatThreadPhone("0507677613")).toBe("507677613");
  expect(normalizeChatThreadPhone("972507677613")).toBe("507677613");
});

test("known leads include linked rows and unlinked rows for the same phone", () => {
  expect(
    buildChatThreadFilter({
      contactId: "lead-id",
      contactType: "lead",
      phone: "972507677613",
    }),
  ).toBe("lead_id.eq.lead-id,sender_phone.ilike.%507677613");
});

test("clients use the same unified phone identity filter", () => {
  expect(
    buildChatThreadFilter({
      contactId: "client-id",
      contactType: "client",
      phone: "050-767-7613",
    }),
  ).toBe("client_id.eq.client-id,sender_phone.ilike.%507677613");
});

test("entity ids and short numbers never act as a phone identity", () => {
  expect(normalizeChatThreadPhone("f29112f1-4a1b-4c0e-9a11-76224905317b")).toBe(
    "",
  );
  expect(normalizeChatThreadPhone("12345")).toBe("");
  expect(
    buildChatThreadFilter({
      contactId: "lead-id",
      contactType: "lead",
      phone: null,
    }),
  ).toBe("lead_id.eq.lead-id");
});

test("unknown contacts and groups retain their canonical identity", () => {
  expect(
    buildChatThreadFilter({
      contactId: "972507677613",
      contactType: "unknown",
      phone: "972507677613",
    }),
  ).toBe("sender_phone.ilike.%507677613");
  expect(
    buildChatThreadFilter({
      contactId: "group-id",
      contactType: "group",
      phone: null,
    }),
  ).toBe("group_id.eq.group-id");
});
