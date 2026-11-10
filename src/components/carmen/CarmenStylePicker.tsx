import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import {
  type CarmenAvatarStyle,
  useCarmenAvatarStyle,
} from "@/hooks/useCarmenAvatarStyle";
import { cn } from "@/lib/utils";
import { CARMEN_ROLES } from "../../../supabase/functions/_shared/carmen/skin-roles";

const OPTIONS: Array<{
  style: CarmenAvatarStyle;
  title: string;
  description: string;
}> = [
  {
    style: "orbs",
    title: "ספירות",
    description: "ספירת זכוכית בצבע של כל סקין. ברירת המחדל של המערכת.",
  },
  {
    style: "character",
    title: "כרמן",
    description: "הדמות המאוירת של כרמן והפורטרטים של הסקינים.",
  },
];

/** Settings card for choosing how Carmen is drawn across the system. */
export function CarmenStylePicker() {
  const { style, setStyle, saving } = useCarmenAvatarStyle();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">סגנון כרמן</h2>
        <p className="text-muted-foreground">
          איך כרמן והסקינים שלה מופיעים בכל המערכת.
        </p>
      </div>
      <div role="radiogroup" className="grid gap-4 md:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.style === style;
          return (
            <button
              key={option.style}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => setStyle(option.style)}
              className="text-start"
            >
              <Card
                className={cn(
                  "space-y-4 p-5 transition-shadow hover:shadow-elevation-2",
                  selected && "ring-2 ring-primary",
                )}
              >
                <StylePreview style={option.style} />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{option.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {selected && <Check className="h-5 w-5 text-primary" />}
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** A row of avatars in the given style. */
function StylePreview({ style }: { style: CarmenAvatarStyle }) {
  if (style === "character") {
    return (
      <div className="flex h-14 items-center gap-2">
        <CarmenPortrait />
      </div>
    );
  }
  return (
    <div className="flex h-14 items-center gap-2" aria-hidden="true">
      {CARMEN_ROLES.slice(0, 6).map((role) => (
        <CarmenOrb
          key={role.slug}
          tint={role.orbTint ?? undefined}
          className="h-9 w-9"
        />
      ))}
    </div>
  );
}
