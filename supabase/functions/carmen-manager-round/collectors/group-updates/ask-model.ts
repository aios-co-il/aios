/**
 * One digest call to the model: _shared/ai.ts aiChat in JSON mode, logged
 * under the tenant with source manager_round:group_updates. Only the
 * platform's own key (the OPENAI_API_KEY secret) is used: without it aiChat
 * falls back to the first stored 'llm' key of any tenant, and one tenant's
 * client group text must never go through another tenant's account. A call
 * is given up after MODEL_CALL_MS, so one hung request cannot outlive the
 * round's time budget; its usage row still lands and counts next time.
 */
import { aiChat } from "../../../_shared/ai.ts";

/** One model call: its JSON text (null on failure) and its cost. */
export type AskModel = (
  prompt: string,
) => Promise<{ text: string | null; costUsd: number }>;

/** The longest a call may take; the round reserves as much before one. */
export const MODEL_CALL_MS = 12_000;

export type AskModelDeps = {
  chat: typeof aiChat;
  hasPlatformKey: () => boolean;
  timeoutMs: number;
};

/** The tenant's metered digest call, or a null answer when it may not run. */
export function modelAsker(
  tenantId: string,
  source: string,
  deps: AskModelDeps = platformDeps(),
): AskModel {
  return async (prompt) => {
    if (!deps.hasPlatformKey()) {
      return { text: null, costUsd: 0 };
    }
    let costUsd = 0;
    const call = deps.chat(prompt, {
      jsonMode: true,
      tenantId,
      source,
      onUsage: (usage) => {
        costUsd = usage.costUsd;
      },
    });
    const text = await withTimeout(call, deps.timeoutMs);
    return { text, costUsd };
  };
}

/** aiChat over the platform key, cut at MODEL_CALL_MS. */
function platformDeps(): AskModelDeps {
  return {
    chat: aiChat,
    hasPlatformKey: () => !!Deno.env.get("OPENAI_API_KEY"),
    timeoutMs: MODEL_CALL_MS,
  };
}

/** The call's answer, or null once `ms` pass first. */
async function withTimeout(
  call: Promise<string | null>,
  ms: number,
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
