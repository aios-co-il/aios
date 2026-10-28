import {
  assertEquals,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";
import { MONITOR_ALERT_TYPES } from "../fb-campaign-monitor/types.ts";
import { checkOutbound } from "./integration-guard.ts";

Deno.test(
  "staging pulse WhatsApp destination is blocked unless explicitly allowlisted",
  () => {
    const blocked = checkOutbound({
      appEnv: "staging",
      stagingSafeMode: "true",
      integration: "whatsapp",
      destination: "972501234567",
      allowlistRaw: "",
    });
    assertStrictEquals(blocked.decision, "BLOCK");
    assertStrictEquals(blocked.reason, "empty_allowlist");

    const allowed = checkOutbound({
      appEnv: "staging",
      stagingSafeMode: "true",
      integration: "whatsapp",
      destination: "972501234567",
      allowlistRaw: "972501234567",
    });
    assertStrictEquals(allowed.decision, "ALLOW");
    assertStrictEquals(allowed.reason, "allowlist_match");
  },
);

Deno.test(
  "pulse queue terminates at the Manus sender guarded by checkWhatsAppSend",
  async () => {
    const snapshot = await readFile(
      new URL("../campaign-pulse-snapshot/index.ts", import.meta.url),
      "utf8",
    );
    const sender = await readFile(
      new URL("../send-manus-wa-message/index.ts", import.meta.url),
      "utf8",
    );
    assertMatch(snapshot, /claude_notify_david/);
    assertMatch(sender, /checkWhatsAppSend/);
    assertMatch(sender, /decision === ['"]BLOCK['"]/);
  },
);

Deno.test(
  "legacy Facebook monitor cannot emit duplicate KPI alerts",
  async () => {
    // KPI exceptions belong to campaign-pulse-snapshot; the monitor records and
    // sends platform-operational failures only.
    assertEquals([...MONITOR_ALERT_TYPES].sort(), [
      "account_disabled",
      "ad_account_billing_issue",
      "ad_disapproved",
      "campaign_stopped",
      "campaign_with_issues",
      "no_live_ads",
    ]);
    const dir = new URL("../fb-campaign-monitor/", import.meta.url);
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || entry.name.includes(".test.")) continue;
      const source = await readFile(new URL(entry.name, dir), "utf8");
      assertNotMatch(source, /cpl_spike/);
      assertNotMatch(source, /כרמן נתחי/);
    }
  },
);
