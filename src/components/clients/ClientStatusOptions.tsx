import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_TONE_CLASS } from "@/components/report-ui/statusTone";
import { cn } from "@/lib/utils";
import {
  CLIENT_MOODS,
  CLIENT_MOOD_META,
  CLIENT_STATUSES,
  CLIENT_STATUS_META,
  clientMoodOf,
  clientStatusOf,
} from "./clientStatusMeta";

/** The four statuses as select items, each with its status dot. */
export function ClientStatusOptions() {
  return (
    <>
      {CLIENT_STATUSES.map((status) => {
        const meta = CLIENT_STATUS_META[status];
        return (
          <SelectItem key={status} value={status}>
            <span className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", meta.dotClass)} />
              {meta.label}
            </span>
          </SelectItem>
        );
      })}
    </>
  );
}

/** The four moods as select items, each with its icon. */
export function ClientMoodOptions({ short = false }: { short?: boolean }) {
  return (
    <>
      {CLIENT_MOODS.map((mood) => {
        const meta = CLIENT_MOOD_META[mood];
        const Icon = meta.icon;
        return (
          <SelectItem key={mood} value={mood}>
            <span className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", meta.textClass)} />
              {short ? meta.shortLabel : meta.label}
            </span>
          </SelectItem>
        );
      })}
    </>
  );
}

interface PickerProps {
  value: string | null;
  onChange: (value: string) => void;
  className?: string;
}

/** A status picker whose trigger reads as the status chip. */
export function ClientStatusPicker({
  value,
  onChange,
  className,
}: PickerProps) {
  const tone = CLIENT_STATUS_META[clientStatusOf(value)].tone;
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 w-auto min-w-[104px] gap-2 rounded-full border-transparent text-xs font-medium",
          STATUS_TONE_CLASS[tone],
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[100] bg-background" align="end">
        <ClientStatusOptions />
      </SelectContent>
    </Select>
  );
}

/** A mood picker whose trigger is tinted by the current mood; an unset mood reads as happy. */
export function ClientMoodPicker({
  value,
  onChange,
  className,
  short = false,
}: PickerProps & { short?: boolean }) {
  const mood = clientMoodOf(value);
  return (
    <Select value={mood} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 w-auto min-w-[104px] gap-2 rounded-full border-transparent text-xs font-medium",
          CLIENT_MOOD_META[mood].surfaceClass,
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[100] bg-background" align="end">
        <ClientMoodOptions short={short} />
      </SelectContent>
    </Select>
  );
}
