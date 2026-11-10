import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { CONTROL_MODES } from "./controlModes";

/** Four autonomy levels: a segmented picker and the chosen mode's card. */
export function ControlSection() {
  const [index, setIndex] = useState(0);
  const mode = CONTROL_MODES[index];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
      <Reveal>
        <SectionHeading
          kicker="05 / YOU STAY IN CONTROL"
          title="אני עובדת בדרך שלך."
          subtitle="אתה מחליט כמה אני עושה לבד."
        >
          מייעוץ חכם ועד ניהול שיווק כמעט מלא — אתה קובע את רמת העצמאות, וכרמן
          מתאימה את עצמה לדרך שבה העסק שלך רוצה לעבוד.
        </SectionHeading>
      </Reveal>
      <div
        role="radiogroup"
        aria-label="רמת העבודה של כרמן"
        className="mt-12 grid grid-cols-2 gap-1 rounded-lg border bg-surface-inset p-1 md:grid-cols-4"
      >
        {CONTROL_MODES.map((item, itemIndex) => (
          <button
            key={item.n}
            type="button"
            role="radio"
            aria-checked={itemIndex === index}
            onClick={() => setIndex(itemIndex)}
            className={cn(
              "rounded-md px-4 py-3 text-start transition-all",
              itemIndex === index
                ? "bg-card shadow-elevation-1"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block text-xs font-medium text-muted-foreground">
              {item.n}
            </span>
            <span className="font-semibold">{item.label}</span>
          </button>
        ))}
      </div>
      <div
        key={index}
        aria-live="polite"
        className="material-card mt-4 grid gap-8 rounded-lg p-8 animate-in fade-in-0 duration-300 md:grid-cols-[1.4fr_1fr] md:p-10"
      >
        <div>
          <span className="text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            CARMEN / MODE {mode.n}
          </span>
          <h3 className="mt-3 text-3xl font-bold">{mode.title}</h3>
          <p className="mt-3 text-lg text-muted-foreground">
            {mode.description}
          </p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-full bg-success px-4 py-2 text-sm text-success-foreground">
            <span>רמת מעורבות כרמן</span>
            <b>{mode.short}</b>
          </div>
        </div>
        <ul className="grid content-center gap-3">
          {mode.bullets.map((item) => (
            <li key={item} className="flex items-center gap-3 font-medium">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3.5 w-3.5" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
