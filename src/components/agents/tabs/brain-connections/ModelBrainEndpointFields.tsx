import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MODEL_PRESETS,
  presetById,
} from "../../../../../supabase/functions/_shared/carmen/brain-connections/presets.ts";
import { type FormFieldsProps, urlProblem } from "./modelBrainForm";

/** Provider, name, endpoint, model and the write-only key. */
export function ModelBrainEndpointFields({
  f,
  set,
  onPreset,
  savedKeyLast4,
}: FormFieldsProps & {
  onPreset: (id: string) => void;
  /** Set when editing: the key may stay empty to keep the saved one. */
  savedKeyLast4: string | null | undefined;
}) {
  const preset = presetById(f.preset);
  const problem = urlProblem(f);
  const editing = savedKeyLast4 !== undefined;
  return (
    <>
      <div>
        <Label>ספק</Label>
        <Select value={f.preset} onValueChange={onPreset}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODEL_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>שם (כך יופיע בבורר)</Label>
        <Input
          value={f.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="לדוגמה: GPT קופירייטר"
        />
      </div>
      <div>
        <Label>Base URL</Label>
        <Input
          value={f.baseUrl}
          onChange={(e) => set("baseUrl", e.target.value)}
          placeholder="https://api.example.com/v1"
          dir="ltr"
        />
        {problem && <p className="mt-1 text-xs text-destructive">{problem}</p>}
      </div>
      <div>
        <Label>מודל</Label>
        <Input
          value={f.model}
          onChange={(e) => set("model", e.target.value)}
          list="brain-model-suggestions"
          dir="ltr"
        />
        <datalist id="brain-model-suggestions">
          {(preset?.models ?? []).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>
          מפתח API{editing ? " (השאירו ריק כדי לשמור את הקיים)" : ""}
        </Label>
        <Input
          type="password"
          autoComplete="off"
          value={f.apiKey}
          onChange={(e) => set("apiKey", e.target.value)}
          placeholder={
            savedKeyLast4 ? `••••${savedKeyLast4}` : (preset?.key_hint ?? "")
          }
          dir="ltr"
        />
      </div>
    </>
  );
}
