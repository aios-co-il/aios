import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { readFile } from "node:fs/promises";
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
    const monitor = await readFile(
      new URL("../fb-campaign-monitor/index.ts", import.meta.url),
      "utf8",
    );
    assertNotMatch(monitor, /cpl_spike/);
    assertNotMatch(monitor, /כרמן נתחי/);
    assertMatch(monitor, /platform-operational failures/);
  },
);
