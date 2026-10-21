// Sends the outgoing webhook to the PBX and reports whether it was accepted.
import { buildOutboundRequest } from "../_shared/pbx/outbound.ts";
import type { OutboundCall, PbxSettings } from "../_shared/pbx/types.ts";

const PBX_TIMEOUT_MS = 15000;

export async function sendDialRequest(
  settings: PbxSettings,
  call: OutboundCall,
): Promise<{ ok: boolean; detail: string }> {
  const { url, init } = buildOutboundRequest(settings, call);
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(PBX_TIMEOUT_MS),
    });
    const body = (await res.text()).slice(0, 500);
    return res.ok
      ? { ok: true, detail: body }
      : { ok: false, detail: `HTTP ${res.status}: ${body}` };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}
