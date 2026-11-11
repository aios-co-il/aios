import { useId, useState, type KeyboardEvent } from "react";
import { MAX_ANSWER } from "@functions/_shared/workshop/brief-answers.ts";
import { OTHER_OPTION, freeAnswer } from "@/lib/quickReplies";
import {
  QUICK_REPLY_OPTION,
  QUICK_REPLY_PICKED,
  QUICK_REPLY_SUBMIT,
} from "./quickReplyStyles";

/**
 * The "אחר…" button of one group and, once tapped, a one-line field for an answer in the user's
 * own words. Enter submits it as the group's answer, Escape closes the field.
 */
export function QuickReplyOther({
  label,
  answer,
  open,
  single,
  disabled,
  onOpen,
  onCancel,
  onSubmit,
}: {
  label: string;
  /** The user's own answer already chosen for this group, if any. */
  answer?: string;
  open: boolean;
  /** One question sends on submit; several keep the answer until "שלחי תשובות". */
  single: boolean;
  disabled: boolean;
  onOpen: () => void;
  onCancel: () => void;
  onSubmit: (answer: string) => void;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState("");
  const ready = freeAnswer(draft);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? fieldId : undefined}
        aria-pressed={!!answer}
        title={answer}
        className={`${QUICK_REPLY_OPTION} max-w-[14rem] truncate ${
          answer || open ? QUICK_REPLY_PICKED : ""
        }`}
        onClick={() => {
          setDraft(answer ?? "");
          onOpen();
        }}
      >
        {answer ? `${OTHER_OPTION} ${answer}` : OTHER_OPTION}
      </button>
      {open && !disabled ? (
        <form
          id={fieldId}
          className="flex basis-full items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) {
              onSubmit(ready);
            }
          }}
        >
          <input
            dir="rtl"
            autoFocus
            value={draft}
            maxLength={MAX_ANSWER}
            aria-label={`תשובה משלך: ${label}`}
            placeholder="כתבי תשובה משלך"
            className="min-w-0 flex-1 rounded-full border border-teal-600/40 bg-white/70 px-3 py-1 text-xs text-teal-900 placeholder:text-teal-900/50 focus:outline-none focus-visible:ring-1 focus-visible:ring-teal-600 dark:border-teal-300/40 dark:bg-black/20 dark:text-teal-50 dark:placeholder:text-teal-50/50 dark:focus-visible:ring-teal-200"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="submit"
            disabled={!ready}
            className={`${QUICK_REPLY_OPTION} ${QUICK_REPLY_SUBMIT}`}
          >
            {single ? "שלחי" : "אישור"}
          </button>
          <button
            type="button"
            aria-label="ביטול תשובה משלך"
            className={QUICK_REPLY_OPTION}
            onClick={onCancel}
          >
            ביטול
          </button>
        </form>
      ) : null}
    </>
  );
}
