/** Classify ports over one model answer, recording the prompts asked and the reviews cached. */
import type { ClassifyPorts } from "../collectors/chat/classify.ts";
import { createLlmMeter } from "../collectors/chat/llm-meter.ts";
import type { CachedReview } from "../collectors/chat/review-cache.ts";
import type { ChatVerdict } from "../collectors/chat/verdict.ts";

/** The verdict the fake model gives by default. */
export const ASKED_VERDICT: ChatVerdict = {
  needs_reply: true,
  is_request: true,
  complaint_ids: [],
  urgency: "normal",
  summary_he: "מבקש להעלות מבצע",
  confidence: 0.9,
};

/** The model's JSON answer for ASKED_VERDICT naming complaint `lines`. */
export function modelAnswer(lines: number[] = []): string {
  const { complaint_ids: _ids, ...rest } = ASKED_VERDICT;
  return JSON.stringify({ ...rest, complaint_lines: lines });
}

/** Ports with these cached reviews, daily cap and answer (null: the model is down); each call costs $0.002. */
export function fakeClassifyPorts(
  fields: {
    cached?: Map<string, CachedReview>;
    dailyCapUsd?: number;
    answer?: string | null;
  } = {},
) {
  const prompts: string[] = [];
  const saved: CachedReview[] = [];
  const meter = createLlmMeter({
    monthBudgetUsd: null,
    monthSpentUsd: 0,
    dailyCapUsd: fields.dailyCapUsd ?? 1,
    daySpentUsd: 0,
  });
  const fake: ClassifyPorts = {
    cache: {
      load: () => Promise.resolve(new Map(fields.cached ?? [])),
      save: (_key, review) => {
        saved.push({ messageId: review.messageId, verdict: review.verdict });
        return Promise.resolve();
      },
    },
    ask: (prompt) => {
      prompts.push(prompt);
      const text = fields.answer === undefined ? modelAnswer() : fields.answer;
      return Promise.resolve({ text, costUsd: 0.002 });
    },
    meter: () => Promise.resolve(meter),
  };
  return { fake, prompts, saved };
}
