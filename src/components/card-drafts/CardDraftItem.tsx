import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDateTime } from "@/lib/formatDateTime";
import type { CardDraftView } from "./useCardDrafts";

type CardDraftItemProps = {
  draft: CardDraftView;
  checked: boolean;
  onToggle: (id: string) => void;
};

/** One draft: a checkbox, the client, its code and the text approval writes. */
export function CardDraftItem({
  draft,
  checked,
  onToggle,
}: CardDraftItemProps) {
  const checkboxId = `card-draft-${draft.id}`;
  return (
    <Card className="p-3">
      <label
        htmlFor={checkboxId}
        className="flex cursor-pointer items-start gap-3"
      >
        <Checkbox
          id={checkboxId}
          checked={checked}
          onCheckedChange={() => onToggle(draft.id)}
          aria-label={`בחירת עדכון #${draft.shortCode}`}
          className="mt-1 h-5 w-5"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
            <span className="font-medium">{draft.clientName ?? "לקוח"}</span>
            <span className="text-xs text-muted-foreground">
              #{draft.shortCode} · {formatDateTime(draft.lastSeenAt)}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm">
            {draft.text}
          </p>
          {draft.contactText && (
            <p className="text-xs text-muted-foreground">
              יירשם גם כקשר עם הלקוח: {draft.contactText}
            </p>
          )}
        </div>
      </label>
    </Card>
  );
}
