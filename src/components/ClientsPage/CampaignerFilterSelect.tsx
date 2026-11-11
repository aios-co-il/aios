import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** A campaigner the list can be filtered by. */
export interface CampaignerOption {
  id: string;
  full_name: string;
}

/** The campaigner filter, shared by the toolbar and the filters dialog. */
export function CampaignerFilterSelect({
  value,
  onChange,
  campaigners,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  campaigners: ReadonlyArray<CampaignerOption>;
  triggerClassName: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="כל הקמפיינרים" />
      </SelectTrigger>
      <SelectContent className="bg-background">
        <SelectItem value="all">כל הקמפיינרים</SelectItem>
        {campaigners.map((campaigner) => (
          <SelectItem key={campaigner.id} value={campaigner.id}>
            {campaigner.full_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
