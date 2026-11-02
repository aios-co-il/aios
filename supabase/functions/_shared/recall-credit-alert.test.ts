import { assert, assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  notifyRecallCreditEmpty,
  recallCreditEmptyWhatsApp,
} from "./recall-credit-alert.ts";

function mockSupabase(opts: { existing?: unknown[] }) {
  const calls: { table?: string; rpc?: string; payload?: unknown }[] = [];
  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    const chain = () => api;
    api.select = chain;
    api.eq = chain;
    api.gte = chain;
    api.limit = async () => ({ data: opts.existing ?? [] });
    api.insert = async (payload: unknown) => {
      calls.push({ table, payload });
      return { data: null };
    };
    return api;
  };
  const rpc = async (name: string, payload: unknown) => {
    calls.push({ rpc: name, payload });
    return { data: { queued: true } };
  };
  return { from, rpc, calls };
}

Deno.test(
  "empty-credit WhatsApp includes the EU billing dashboard by default region fallback",
  () => {
    assertMatch(
      recallCreditEmptyWhatsApp(),
      /recall\.ai\/dashboard\/billing\/usage/,
    );
  },
);

Deno.test(
  "notifyRecallCreditEmpty skips WhatsApp when a quota_out already fired recently",
  async () => {
    const sb = mockSupabase({ existing: [{ id: "already" }] });
    const sent = await notifyRecallCreditEmpty(sb as never);
    assertStrictEquals(sent, false);
    assertStrictEquals(sb.calls.length, 0);
  },
);

Deno.test(
  "notifyRecallCreditEmpty writes intel feed + claude_notify_david on first down",
  async () => {
    const sb = mockSupabase({ existing: [] });
    const sent = await notifyRecallCreditEmpty(sb as never);
    assertStrictEquals(sent, true);
    assertStrictEquals(
      sb.calls.some((c) => c.table === "integration_alerts_log"),
      true,
    );
    const rpc = sb.calls.find((c) => c.rpc === "claude_notify_david");
    assert(rpc);
    assertMatch(
      String((rpc.payload as { p_message: string }).p_message),
      /נגמר הקרדיט/,
    );
  },
);
