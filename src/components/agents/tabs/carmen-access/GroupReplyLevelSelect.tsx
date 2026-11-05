import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accessFlagsFor,
  GROUP_REPLY_LEVEL_LABELS,
  GROUP_REPLY_LEVELS,
  type GroupAccessFlags,
  type GroupReplyLevel,
  replyLevelOfRow,
} from "../../../../../supabase/functions/_shared/carmen/group-reply-level.ts";

/**
 * Whom Carmen answers in a client's group: automations only, staff, or staff
 * and the client. Reads and writes the row's two access flags.
 */
export function GroupReplyLevelSelect({
  flags,
  onChange,
}: {
  flags: GroupAccessFlags;
  onChange: (flags: GroupAccessFlags) => void;
}) {
  return (
    <Select
      value={replyLevelOfRow(flags)}
      onValueChange={(level: GroupReplyLevel) =>
        onChange(accessFlagsFor(level))
      }
    >
      <SelectTrigger className="text-right" aria-label="כרמן בקבוצה">
        <SelectValue />
      </SelectTrigger>
      <SelectContent dir="rtl">
        {GROUP_REPLY_LEVELS.map((level) => (
          <SelectItem key={level} value={level}>
            {GROUP_REPLY_LEVEL_LABELS[level]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
