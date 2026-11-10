import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

const BARS = [32, 45, 39, 65, 53, 76, 68, 90, 82];

/**
 * Navy contrast section. The `dark` class switches the theme tokens for this
 * subtree only, so its colors still come from the tenant brand.
 */
export function DataSection() {
  return (
    <section className="dark bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:px-6 md:py-28">
        <Reveal>
          <SectionHeading
            kicker="04 / SEE THE WHOLE PICTURE"
            title="הנתונים לא צריכים לחכות"
            subtitle="לסוף החודש."
          >
            דוחות ודשבורדים שמחברים את המספרים לתמונה ברורה. בלי לחפש בין עשר
            מערכות.
          </SectionHeading>
        </Reveal>
        <Reveal>
          <div
            role="img"
            aria-label="המחשת דשבורד, ללא נתונים אמיתיים"
            className="rounded-lg border bg-card p-6 shadow-elevation-2"
          >
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>OVERVIEW / ILLUSTRATION</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-status-active" />
                AIOS
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatTile label="CAMPAIGNS" value="CONNECTED" />
              <StatTile label="LEADS" value="IN SYNC" />
            </div>
            <div className="mt-6 flex h-40 items-end gap-2">
              {BARS.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-sm bg-gradient-to-t from-primary/40 to-primary"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Illustrative visualization — not live business data
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** One label/value tile inside the sample dashboard. */
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-surface-elevated p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
