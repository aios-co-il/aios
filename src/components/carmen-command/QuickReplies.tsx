import { useState } from "react";
import {
  offersOther,
  quickReplyAnswer,
  type QuickReplyGroup,
} from "@/lib/quickReplies";
import { QuickReplyOther } from "./QuickReplyOther";
import { QUICK_REPLY_OPTION, QUICK_REPLY_PICKED } from "./quickReplyStyles";

/**
 * Tap-to-answer buttons under Carmen's question. One question answers on the tap; several
 * collect a choice each and send together. "אחר…" takes the user's own words as the group's
 * choice.
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
  const [editing, setEditing] = useState<string | null>(null);
  const single = groups.length === 1;
  const disabled = !onAnswer || sent;

  const send = (choices: Record<string, string>) => {
    const answer = quickReplyAnswer(groups, choices);
    if (!answer || !onAnswer) return;
    setSent(true);
    onAnswer(answer);
  };
  const choose = (label: string, answer: string) => {
    const next = { ...picked, [label]: answer };
    setPicked(next);
    setEditing(null);
    if (single) {
      send(next);
    }
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
                className={`${QUICK_REPLY_OPTION} ${
                  picked[group.label] === option ? QUICK_REPLY_PICKED : ""
                }`}
                onClick={() => choose(group.label, option)}
              >
                {option}
              </button>
            ))}
            {offersOther(group) ? (
              <QuickReplyOther
                label={group.label}
                answer={
                  group.options.includes(picked[group.label])
                    ? undefined
                    : picked[group.label]
                }
                open={editing === group.label}
                single={single}
                disabled={disabled}
                onOpen={() => setEditing(group.label)}
                onCancel={() => setEditing(null)}
                onSubmit={(answer) => choose(group.label, answer)}
              />
            ) : null}
          </div>
        </div>
      ))}
      {single ? null : (
        <button
          type="button"
          disabled={disabled || Object.keys(picked).length === 0}
          className={`${QUICK_REPLY_OPTION} !bg-teal-300/30`}
          onClick={() => send(picked)}
        >
          שלחי תשובות
        </button>
      )}
    </div>
  );
}
