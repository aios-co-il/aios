import { TemplateFieldPicker } from "./TemplateFieldPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Field-insert menu plus the "preview as list member" list picker. */
export function TemplateEditorToolbar({
  onPick,
  customKeys,
  staticLists,
  sampleListId,
  onSampleListChange,
}: {
  onPick: (token: string) => void;
  customKeys: string[];
  staticLists: { id: string; name: string }[];
  sampleListId: string | undefined;
  onSampleListChange: (id: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TemplateFieldPicker onPick={onPick} customKeys={customKeys} />
      <Select
        value={sampleListId ?? "none"}
        onValueChange={(v) => onSampleListChange(v === "none" ? undefined : v)}
      >
        <SelectTrigger className="h-9 w-48">
          <SelectValue placeholder="תצוגה לפי רשימה" />
        </SelectTrigger>
        <SelectContent className="z-[100]">
          <SelectItem value="none">נתוני דוגמה</SelectItem>
          {staticLists.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
