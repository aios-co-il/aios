import { getCarmenRole } from "../../../supabase/functions/_shared/carmen/skin-roles";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCarmenSkins } from "@/hooks/useCarmenSkins";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const BASE = "marketing_manager";

/** Switches Carmen's active skin from the working context; her visible avatar follows immediately. */
export function CarmenSkinSwitcher({
  className = "h-11 min-w-[9rem] max-w-[16rem] flex-1",
}: {
  /** Size classes for the trigger. */
  className?: string;
}) {
  const {
    visibleSkins: skins,
    activeSlug,
    setActiveSkin,
    canEdit,
    isLoading,
  } = useCarmenSkins();
  if (!canEdit || (!isLoading && skins.length === 0)) return null;
  const active = skins.find(
    (s) => s.slug === (getCarmenRole(activeSlug)?.slug ?? BASE),
  );

  return (
    <Select
      dir="rtl"
      value={active?.slug ?? BASE}
      disabled={isLoading}
      onValueChange={(v) =>
        setActiveSkin(v).catch((e) =>
          toast.error("החלפת הסקין נכשלה: " + (e?.message || e)),
        )
      }
    >
      <SelectTrigger
        aria-label="בחירת סקין"
        title="סקין — התפקיד והדמות של כרמן"
        className={`rounded-lg border-[var(--cc-line)] bg-[rgba(5,10,22,0.6)] px-2 text-xs text-[var(--cc-text)] shadow-none ring-0 focus:ring-0 ${className}`}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--cc-accent)]" />
          <span className="truncate">
            {active ? active.name : "מנהלת שיווק"}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent className="cc-root cc-menu z-[90] max-h-80 border-[var(--cc-line-strong)] bg-[rgba(8,16,34,0.98)] text-[var(--cc-text)]">
        {skins.map((s) => (
          <SelectItem
            key={s.slug}
            value={s.slug}
            textValue={s.name}
            aria-label={s.name}
          >
            <span className="flex items-center gap-2">
              {s.avatarUrl && (
                <span aria-hidden="true">
                  <CarmenPortrait
                    image={s.avatarUrl}
                    name={s.name}
                    custom
                    className="!h-7 !w-7 shrink-0"
                  />
                </span>
              )}
              <span>{s.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
