import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEVEL_LABEL, NONE } from "./types";

/** "No access / full / bug fixes only" picker used for brains and dev tasks. */
export function LevelSelect({
  value,
  disabled,
  allowBugfix,
  bugfixFirst = false,
  noneLabel = LEVEL_LABEL[NONE],
  onChange,
}: {
  value: string;
  disabled: boolean;
  allowBugfix: boolean;
  bugfixFirst?: boolean;
  /** Label for the empty value (dev tasks: "ברירת מחדל", not "no access"). */
  noneLabel?: string;
  onChange: (value: string) => void;
}) {
  const levels = bugfixFirst ? ["bugfix", "full"] : ["full", "bugfix"];
  return (
    <Select
      dir="rtl"
      value={value}
      disabled={disabled}
      onValueChange={onChange}
    >
      <SelectTrigger className="h-7 w-[8.5rem] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{noneLabel}</SelectItem>
        {levels
          .filter((l) => l !== "bugfix" || allowBugfix)
          .map((l) => (
            <SelectItem key={l} value={l}>
              {LEVEL_LABEL[l]}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
