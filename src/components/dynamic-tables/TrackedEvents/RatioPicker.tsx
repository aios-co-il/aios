import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TrackedEvent } from "./trackedEvents";

const NONE = "__none__";

type Props = {
  /** The events checked in the editor, which the pair picks from. */
  events: Array<TrackedEvent>;
  /** The pair as picked so far; a side may still be empty. */
  value: RatioDraft;
  onChange: (draft: RatioDraft) => void;
};

/** The pair while it is being picked. */
export type RatioDraft = { from?: string; to?: string };

/** Picks the two events whose conversion the dashboard shows as a card. */
export function RatioPicker({ events, value, onChange }: Props) {
  const pick = (side: "from" | "to", event: string) =>
    onChange({ ...value, [side]: event === NONE ? undefined : event });
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-medium">יחס המרה בין שני אירועים</p>
      <div className="flex items-center gap-2">
        <EventSelect
          label="מאירוע"
          events={events.filter((item) => item.event !== value.to)}
          value={value.from}
          onChange={(event) => pick("from", event)}
        />
        <span className="text-muted-foreground">←</span>
        <EventSelect
          label="לאירוע"
          events={events.filter((item) => item.event !== value.from)}
          value={value.to}
          onChange={(event) => pick("to", event)}
        />
      </div>
    </div>
  );
}

/** One side of the pair, or none to hide the card. */
function EventSelect({
  label,
  events,
  value,
  onChange,
}: {
  label: string;
  events: Array<TrackedEvent>;
  value: string | undefined;
  onChange: (event: string) => void;
}) {
  // A side whose event was unchecked shows "none", which is what saves.
  const selected = events.some((item) => item.event === value) ? value : NONE;
  return (
    <Select value={selected} onValueChange={onChange}>
      <SelectTrigger className="w-48" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>ללא</SelectItem>
        {events.map((item) => (
          <SelectItem key={item.event} value={item.event}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
