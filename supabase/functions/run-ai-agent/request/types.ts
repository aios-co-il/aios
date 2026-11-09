import type { RunBody } from "../run/contracts.ts";
import type { DirectToolRequest } from "../direct-tools/types.ts";

/** Accepted HTTP fields; parsing retains the legacy boundary without new validation. */
export interface AgentRequestBody extends RunBody {
  direct_tool?: DirectToolRequest | null;
  stream?: boolean;
  surface?: unknown;
  reply_key?: unknown;
}
