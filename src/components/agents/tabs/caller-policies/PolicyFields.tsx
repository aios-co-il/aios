import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** A labelled form field. */
export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** A list of topics edited as one per line. */
export function TopicsField({
  id,
  label,
  topics,
  onChange,
}: {
  id: string;
  label: string;
  topics: Array<string>;
  onChange: (topics: Array<string>) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Textarea
        id={id}
        rows={Math.max(3, topics.length + 1)}
        value={topics.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </Field>
  );
}

/** A labelled on/off switch. */
export function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
