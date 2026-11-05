import { assertStrictEquals } from "jsr:@std/assert@1";

import {
  clientCardSourceCanCountAsContact,
  clientCardSourceLabel,
  isHumanClientCardSource,
} from "./sources.ts";

Deno.test(
  "source vocabulary: legacy rows are human, only human and confirmed rows can count",
  () => {
    assertStrictEquals(isHumanClientCardSource(null), true);
    assertStrictEquals(isHumanClientCardSource(undefined), true);
    assertStrictEquals(isHumanClientCardSource("human"), true);
    assertStrictEquals(isHumanClientCardSource("carmen"), false);
    assertStrictEquals(isHumanClientCardSource("future_source"), false);
    assertStrictEquals(clientCardSourceCanCountAsContact("human"), true);
    assertStrictEquals(
      clientCardSourceCanCountAsContact("carmen_confirmed"),
      true,
    );
    for (const source of [
      "carmen",
      "system_send",
      "group_digest",
      "automation",
    ]) {
      assertStrictEquals(
        clientCardSourceCanCountAsContact(source),
        false,
        source,
      );
    }
    assertStrictEquals(clientCardSourceLabel("human"), null);
    assertStrictEquals(clientCardSourceLabel("carmen_confirmed"), "כרמן");
    assertStrictEquals(clientCardSourceLabel("system_send"), "נשלח מהמערכת");
    assertStrictEquals(clientCardSourceLabel("group_digest"), "סיכום קבוצה");
    assertStrictEquals(clientCardSourceLabel("automation"), "אוטומציה");
  },
);

Deno.test(
  "clientCardSourceCanCountAsContact: legacy rows without a source count like human rows",
  () => {
    assertStrictEquals(clientCardSourceCanCountAsContact(null), true);
    assertStrictEquals(clientCardSourceCanCountAsContact(undefined), true);
    assertStrictEquals(clientCardSourceCanCountAsContact("future"), false);
  },
);
