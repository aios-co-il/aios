import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";
import { CarmenPortrait } from "@/components/carmen-profile/CarmenPortrait";
import {
  type CarmenAvatarStyle,
  useCarmenAvatarStyle,
} from "@/hooks/useCarmenAvatarStyle";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import type { KeyboardEvent } from "react";
import { CARMEN_ROLES } from "../../../supabase/functions/_shared/carmen/skin-roles";

const OPTIONS: Array<{
  style: CarmenAvatarStyle;
  title: string;
  description: string;
}> = [
  {
    style: "minime",
    title: "Mini Me",
    description:
      "דמות זכוכית עם עיניים גדולות וזרת בפה, בצבע ובאביזר של כל סקין. ברירת המחדל של המערכת.",
  },
  {
    style: "orbs",
    title: "ספירות",
    description: "ספירת זכוכית בצבע של כל סקין.",
  },
  {
    style: "character",
    title: "כרמן",
    description: "הדמות המאוירת של כרמן והפורטרטים של הסקינים.",
  },
];

const HEADING_ID = "carmen-style-heading";

/**
 * Settings card for choosing how Carmen is drawn across the system. Only
 * owners and super admins may save it (`tenant_settings` row-level security).
 */
export function CarmenStylePicker() {
  const { style, setStyle, saving } = useCarmenAvatarStyle();
  const { isOwner, isSuperAdmin } = useUserRole();
  const canEdit = isOwner || isSuperAdmin;

  return (
    <section className="space-y-4">
      <div>
        <h2 id={HEADING_ID} className="text-2xl font-bold">
          סגנון כרמן
        </h2>
        <p className="text-muted-foreground">
          איך כרמן והסקינים שלה מופיעים בכל המערכת.
          {!canEdit && " רק בעלי הארגון יכולים לשנות את הסגנון."}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby={HEADING_ID}
        onKeyDown={(event) =>
          canEdit && !saving && selectWithArrows(event, style, setStyle)
        }
        className="grid gap-4 md:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const selected = option.style === style;
          return (
            <button
              key={option.style}
              type="button"
              role="radio"
              aria-checked={selected}
              data-style={option.style}
              // One Tab stop for the group; arrow keys move between options.
              tabIndex={selected ? 0 : -1}
              // While saving, stay focusable (aria-disabled) so keyboard
              // focus does not drop out of the group; clicks are ignored.
              disabled={!canEdit}
              aria-disabled={saving || !canEdit}
              onClick={() => !saving && setStyle(option.style)}
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

/** Radio-group arrow keys: move to the next or previous style and select it. */
function selectWithArrows(
  event: KeyboardEvent<HTMLDivElement>,
  current: CarmenAvatarStyle,
  select: (style: CarmenAvatarStyle) => void,
) {
  const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[
    event.key
  ];
  if (!step) {
    return;
  }
  event.preventDefault();
  const index = OPTIONS.findIndex((option) => option.style === current);
  const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length].style;
  select(next);
  event.currentTarget
    .querySelector<HTMLButtonElement>(`[data-style="${next}"]`)
    ?.focus();
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
  if (style === "minime") {
    return (
      <div className="flex h-14 items-center gap-1" aria-hidden="true">
        {CARMEN_ROLES.slice(0, 6).map((role) => (
          <MiniMe key={role.slug} skin={role.slug} className="w-11" />
        ))}
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
