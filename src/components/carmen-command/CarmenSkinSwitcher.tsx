import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const BASE = "__base__";

/** Switches Carmen's active skin from the working context; her visible avatar follows immediately. */
export function CarmenSkinSwitcher({ className = "" }: { className?: string }) {
  const { skins, activeSlug, setActiveSkin, canEdit, isLoading } =
    useCarmenSkins();
  if (!canEdit || (!isLoading && skins.length === 0)) return null;
  const active = skins.find((s) => s.slug === activeSlug);

  return (
    <Select
      value={active ? active.slug : BASE}
      disabled={isLoading}
      onValueChange={(v) =>
        setActiveSkin(v === BASE ? null : v).catch((e) =>
          toast.error("החלפת הסקין נכשלה: " + (e?.message || e)),
        )
      }
    >
      <SelectTrigger
        aria-label="בחירת סקין"
        title="סקין — התפקיד והדמות של כרמן"
        className={`h-11 min-w-[9rem] max-w-[16rem] flex-1 border-[var(--cc-line)] bg-[rgba(5,10,22,0.6)] text-xs text-[var(--cc-text)] shadow-none ring-0 focus:ring-0 ${className}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
          <span className="truncate">
            {active ? active.name : "סקין: רגיל"}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent className="cc-root z-[90] max-h-80 border-[var(--cc-line-strong)] bg-[rgba(8,16,34,0.98)] text-[var(--cc-text)]">
        <SelectItem value={BASE} textValue="רגיל">
          רגיל (ללא סקין)
        </SelectItem>
        {skins.map((s) => (
          <SelectItem key={s.slug} value={s.slug} textValue={s.name}>
            <span className="flex items-center gap-2">
              {s.avatarUrl && (
                <img
                  src={s.avatarUrl}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              )}
              <span>{s.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
