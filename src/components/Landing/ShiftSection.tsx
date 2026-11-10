import { Fragment } from "react";
import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { CONNECTIONS } from "./landingContent";

/** Why one marketing manager beats another campaigner. */
export function ShiftSection() {
  return (
    <section id="why" className="border-y bg-card">
      <Reveal className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          kicker="01 / THE SHIFT"
          title="קמפיינר חדש"
          subtitle="לא יפתור את הבעיה."
        >
          אתם צריכים מנהל שיווק שינהל לכם את כל המערכת. קמפיינים, SEO, GEO,
          דיוור, סושיאל וגרילה — כרמן מרכזת, מחברת ועוזרת לכם לבצע את הכול.
        </SectionHeading>
        <div className="mt-10 flex flex-wrap items-center gap-2 text-sm font-semibold">
          {CONNECTIONS.map((item, index) => (
            <Fragment key={item}>
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground">
                  ↔
                </span>
              )}
              <span className="rounded-full border bg-background px-4 py-2">
                {item}
              </span>
            </Fragment>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
