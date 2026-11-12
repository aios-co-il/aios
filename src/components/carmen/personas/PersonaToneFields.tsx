import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOOD_OPTIONS,
  WRITING_STYLE_OPTIONS,
} from "@/components/agents/agentToneOptions";
import type { PersonaDraft } from "./carmenPersonas";
import { Field } from "./PersonaFields";

/** A character's mood and writing style. */
export function PersonaToneFields({
  mood,
  writingStyle,
  onChange,
}: {
  mood: string | null;
  writingStyle: string;
  onChange: (patch: Partial<PersonaDraft>) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field id="persona-mood" label="מצב רוח">
        <Select
          value={mood ?? "none"}
          onValueChange={(value) =>
            onChange({ mood: value === "none" ? null : value })
          }
        >
          <SelectTrigger id="persona-mood">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MOOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.emoji} {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="persona-writing" label="סגנון כתיבה">
        <Select
          value={writingStyle || "none"}
          onValueChange={(value) =>
            onChange({ writingStyle: value === "none" ? "" : value })
          }
        >
          <SelectTrigger id="persona-writing">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WRITING_STYLE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}
