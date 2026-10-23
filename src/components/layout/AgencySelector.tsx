import { Building2 } from "lucide-react";
import { useAgency } from "@/contexts/AgencyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Header agency picker; hidden when the user has no agencies. */
export function AgencySelector() {
  const { selectedAgency, setSelectedAgency, agencies } = useAgency();
  if (!(agencies && agencies.length > 0)) return null;
  return (
    <div className="hidden md:flex items-center gap-1 sm:gap-2 min-w-0 max-w-[42vw] sm:max-w-none">
      <span className="text-sm text-muted-foreground hidden lg:inline shrink-0">
        סוכנות:
      </span>
      <Select value={selectedAgency} onValueChange={setSelectedAgency}>
        <SelectTrigger className="h-9 w-[min(42vw,10rem)] sm:w-[160px] md:w-[220px] bg-background border-2 px-2">
          <Building2 className="h-4 w-4 shrink-0" />
          <SelectValue placeholder="סוכנות" />
        </SelectTrigger>
        <SelectContent className="bg-background z-[100]">
          {agencies.length > 1 && (
            <SelectItem value="all">כל הסוכנויות</SelectItem>
          )}
          {agencies.map((agency) => (
            <SelectItem key={agency.id} value={agency.id}>
              {agency.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
