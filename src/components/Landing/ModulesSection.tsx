import { useState } from "react";
import { ArrowUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { MODULES } from "./landingContent";

/** The eight modules: a picker list and a detail card. */
export function ModulesSection() {
  const [active, setActive] = useState(0);
  const current = MODULES[active];
  const Icon = current.icon;

  return (
    <section
      id="system"
      className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28"
    >
      <Reveal>
        <SectionHeading
          kicker="02 / ONE OPERATING SYSTEM"
          title="אני לא עוד מערכת."
          subtitle="אני מחברת את כולן."
        >
          כל מה שהעסק צריך כדי לנהל שיווק ומכירות. לא אוסף כלים שלא מדברים אחד
          עם השני.
        </SectionHeading>
      </Reveal>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <div role="tablist" aria-label="מודולים" className="flex flex-col">
          {MODULES.map((item, index) => (
            <button
              key={item.n}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={cn(
                "flex items-center gap-4 border-b px-3 py-4 text-start text-lg font-semibold transition-colors",
                index === active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="w-6 text-xs font-medium text-muted-foreground">
                {item.n}
              </span>
              <span className="flex-1">{item.title}</span>
              <ArrowUpLeft
                className={cn(
                  "h-4 w-4 transition-opacity",
                  index === active ? "text-primary" : "opacity-0",
                )}
              />
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          key={active}
          className="material-card flex flex-col justify-center rounded-lg p-8 animate-in fade-in-0 duration-300 md:p-10"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-md bg-success text-success-foreground">
            <Icon className="h-6 w-6" />
          </span>
          <span className="mt-8 text-xs font-semibold tracking-[0.2em] text-muted-foreground">
            CARMEN / MODULE {current.n}
          </span>
          <h3 className="mt-3 text-3xl font-bold">{current.title}</h3>
          <p className="mt-3 text-lg text-muted-foreground">{current.desc}</p>
          <div className="mt-8 flex items-center justify-between border-t pt-4 text-xs font-medium text-muted-foreground">
            <span>CONNECTED TO AIOS</span>
            <span className="h-2 w-2 rounded-full bg-status-active" />
          </div>
        </div>
      </div>
    </section>
  );
}
