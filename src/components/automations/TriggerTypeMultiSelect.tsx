import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function TriggerTypeMultiSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const labels = options
    .filter((option) => value.includes(option.value))
    .map((option) => option.label);
  const summary =
    labels.length === 0
      ? "בחר טריגר"
      : labels.length <= 2
        ? labels.join(" / ")
        : `${labels.length} טריגרים`;

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      if (value.length === 1) return;
      onChange(value.filter((item) => item !== optionValue));
      return;
    }
    onChange([...value, optionValue]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between text-right font-normal"
        >
          <span className="truncate">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="max-h-72 space-y-1 overflow-y-auto" dir="rtl">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted"
            >
              <Checkbox
                checked={value.includes(option.value)}
                onCheckedChange={() => toggle(option.value)}
              />
              <span className="text-sm">{option.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
