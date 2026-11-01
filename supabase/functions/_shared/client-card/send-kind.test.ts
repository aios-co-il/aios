import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  SEND_KINDS,
  SEND_REF_MAX_LENGTH,
  SYSTEM_SEND_UPDATE_TYPES,
  USER_SEND_KINDS,
  isSendKind,
  normalizeSendRef,
  resolveSendKind,
  sendKindColumns,
} from "./send-kind.ts";

Deno.test("every system-send entry type is listed once, with a label", () => {
  const values = SYSTEM_SEND_UPDATE_TYPES.map((type) => type.value);
  assertStrictEquals(new Set(values).size, values.length);
  for (const type of SYSTEM_SEND_UPDATE_TYPES) {
    assertStrictEquals(type.label.trim().length > 0, true, type.value);
  }
});

Deno.test(
  "a browser send without a kind is chat; it may only name browser kinds",
  () => {
    for (const requested of [undefined, null, "", "nonsense", 7]) {
      assertStrictEquals(
        resolveSendKind({ requested, isServiceRole: false }),
        "chat",
        String(requested),
      );
    }
    for (const kind of USER_SEND_KINDS) {
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: false }),
        kind,
      );
    }
    // Server-only kinds cannot be claimed from the browser.
    for (const kind of ["broadcast", "carmen", "automation", "staff_alert"]) {
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: false }),
        "chat",
        kind,
      );
    }
  },
);

Deno.test(
  "a service-role send keeps the kind it names and is NULL (never logged) without one",
  () => {
    for (const kind of SEND_KINDS) {
      assertStrictEquals(
        resolveSendKind({ requested: kind, isServiceRole: true }),
        kind,
      );
    }
    assertStrictEquals(
      resolveSendKind({ requested: " chat ", isServiceRole: true }),
      "chat",
    );
    for (const requested of [undefined, null, "", "other", "Broadcast", 7]) {
      assertStrictEquals(
        resolveSendKind({ requested, isServiceRole: true }),
        null,
        String(requested),
      );
    }
  },
);

Deno.test("send_ref is a trimmed, bounded string or null", () => {
  assertStrictEquals(normalizeSendRef(undefined), null);
  assertStrictEquals(normalizeSendRef(null), null);
  assertStrictEquals(normalizeSendRef("   "), null);
  assertStrictEquals(normalizeSendRef({ id: 1 }), null);
  assertStrictEquals(normalizeSendRef(" abc "), "abc");
  assertStrictEquals(normalizeSendRef(42), "42");
  assertStrictEquals(
    normalizeSendRef("x".repeat(500))?.length,
    SEND_REF_MAX_LENGTH,
  );
});

Deno.test("sendKindColumns builds the chat_messages columns", () => {
  assertEquals(
    sendKindColumns({
      sendKind: "report",
      sendRef: "t1",
      isServiceRole: false,
    }),
    { send_kind: "report", send_ref: "t1" },
  );
  assertEquals(
    sendKindColumns({
      sendKind: undefined,
      sendRef: undefined,
      isServiceRole: false,
    }),
    { send_kind: "chat", send_ref: null },
  );
  assertEquals(
    sendKindColumns({
      sendKind: undefined,
      sendRef: undefined,
      isServiceRole: true,
    }),
    { send_kind: null, send_ref: null },
  );
  assertEquals(
    sendKindColumns({
      sendKind: "broadcast",
      sendRef: "b1",
      isServiceRole: true,
    }),
    { send_kind: "broadcast", send_ref: "b1" },
  );
  assertStrictEquals(isSendKind("broadcast"), true);
  assertStrictEquals(isSendKind("Broadcast"), false);
});
