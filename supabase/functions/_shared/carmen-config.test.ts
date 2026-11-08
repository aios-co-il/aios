import { mergeCarmenScopeConfig } from "./carmen-access-policy.ts";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  isValidCarmenScopeMode,
  readCarmenConfig,
  mergeCarmenStepConfig,
  isChatTurn,
  isPermanentError,
  policyEntriesAreParsed,
} from "./carmen-config.ts";
Deno.test("Carmen configuration exposes named fields only", () => {
  assertEquals(readCarmenConfig({ agent_id: "a", arbitrary: { x: true } }), {
    agent_id: "a",
  });
  assertEquals(readCarmenConfig(null), {});
});
Deno.test("invalid routing scopes and group flags cannot enable access", () => {
  const cfg = readCarmenConfig({
    carmen_scope_mode: {},
    carmen_open_member_groups: "true",
    carmen_allowed_group_ids: [{}],
  });
  assertEquals(cfg.carmen_scope_mode, "invalid");
  assertEquals(cfg.carmen_open_member_groups, false);
  assertEquals(cfg.carmen_allowed_group_ids, []);
});
Deno.test("step overrides retain base fields and normalize LID aliases", () => {
  assertEquals(
    mergeCarmenStepConfig(
      { agent_id: "a", end_keyword: "bye" },
      { agent_id: "b", carmen_lid_aliases: { "1": 9725, "2": {} } },
    ),
    { agent_id: "b", end_keyword: "bye", carmen_lid_aliases: { "1": "9725" } },
  );
});
Deno.test(
  "chat, policy and permanent-error guards validate concrete fields",
  () => {
    assertStrictEquals(isChatTurn({ role: "user", content: "hi" }), true);
    assertStrictEquals(isChatTurn({ role: "user", content: 3 }), false);
    assertStrictEquals(isPermanentError({ permanent: true }), true);
    assertStrictEquals(isPermanentError({ permanent: "false" }), false);
    assertStrictEquals(policyEntriesAreParsed([{ phone: "123" }]), true);
  },
);

Deno.test(
  "mixed routing lists preserve valid phones, groups and keywords",
  () => {
    const config = readCarmenConfig({
      carmen_allowed_phones: ["9725", 4, null],
      carmen_allowed_group_ids: [{}, "1@g.us"],
      trigger_keywords: ["Carmen", false],
    });
    assertEquals(config.carmen_allowed_phones, ["9725"]);
    assertEquals(config.carmen_allowed_group_ids, ["1@g.us"]);
    assertEquals(config.trigger_keywords, ["Carmen"]);
  },
);

Deno.test(
  "invalid effective scope is rejected after valid policy overrides",
  () => {
    const cfg = readCarmenConfig({ carmen_scope_mode: {} });
    assertEquals(
      isValidCarmenScopeMode(
        mergeCarmenScopeConfig(cfg, null, [], { isGroup: false }).scopeMode,
      ),
      false,
    );
    assertEquals(
      isValidCarmenScopeMode(
        mergeCarmenScopeConfig(
          cfg,
          { private_phones: [{ phone: "0501234567" }] },
          [],
          {
            isGroup: false,
          },
        ).scopeMode,
      ),
      true,
    );
  },
);

Deno.test(
  "the editor private_only scope survives parsing and the effective scope guard",
  () => {
    const cfg = readCarmenConfig({ carmen_scope_mode: "private_only" });
    assertEquals(cfg.carmen_scope_mode, "private_only");
    assertEquals(
      isValidCarmenScopeMode(
        mergeCarmenScopeConfig(cfg, null, [], { isGroup: false }).scopeMode,
      ),
      true,
    );
  },
);
