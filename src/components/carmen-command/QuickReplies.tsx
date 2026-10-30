import { useState } from "react";
import { quickReplyAnswer, type QuickReplyGroup } from "@/lib/quickReplies";

const OPTION =
  "rounded-full border border-teal-300/40 bg-teal-300/10 px-3 py-1 text-xs font-medium text-teal-50 transition hover:bg-teal-300/25 disabled:cursor-default disabled:opacity-60";

/**
 * Tap-to-answer buttons under Carmen's question. One question answers on the tap; several
 * collect a choice each and send together.
 */
export function QuickReplies({
  groups,
  onAnswer,
}: {
  groups: QuickReplyGroup[];
  /** Absent once the conversation has moved on: the buttons stay visible but inert. */
  onAnswer?: (text: string) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const single = groups.length === 1;
  const disabled = !onAnswer || sent;

  const send = (choices: Record<string, string>) => {
    const answer = quickReplyAnswer(groups, choices);
    if (!answer || !onAnswer) return;
    setSent(true);
    onAnswer(answer);
  };

  return (
    <div className="mt-2 space-y-2" dir="rtl">
      {groups.map((group) => (
        <div key={group.label} className="space-y-1">
          {single ? null : (
            <p className="text-[11px] text-[var(--cc-text-dim)]">
              {group.label}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {group.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={picked[group.label] === option}
                className={`${OPTION} ${
                  picked[group.label] === option
                    ? "!border-teal-200 !bg-teal-300/40"
                    : ""
                }`}
                onClick={() => {
                  const next = { ...picked, [group.label]: option };
                  setPicked(next);
                  if (single) send(next);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      {single ? null : (
        <button
          type="button"
          disabled={disabled || Object.keys(picked).length === 0}
          className={`${OPTION} !bg-teal-300/30`}
          onClick={() => send(picked)}
        >
          שלחי תשובות
        </button>
      )}
    </div>
  );
}
