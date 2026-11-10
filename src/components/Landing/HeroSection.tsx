import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { TalkButton } from "./LandingNav";
import { BrandDot } from "./SectionHeading";

const HERO_POINTS = [
  "בינה מלאכותית שעובדת בשבילך",
  "אנשי מקצוע שמפקחים על כל שלב",
  "מערכת אחת לשיווק ולמכירות",
];

/** Headline, calls to action and Carmen's orb with floating UI samples. */
export function HeroSection() {
  return (
    <section
      id="top"
      className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 md:grid-cols-2 md:px-6 md:pb-28 md:pt-24"
    >
      <div>
        <Badge variant="active" className="gap-2 px-3 py-1 tracking-[0.18em]">
          <span className="h-1.5 w-1.5 rounded-full bg-status-active" />
          AIOS
        </Badge>
        <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-7xl">
          כל השיווק והמכירות
          <br />
          במקום אחד
          <BrandDot />
        </h1>
        <div className="mt-6 h-1 w-14 rounded-full bg-primary" />
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
          AIOS היא מערכת מבוססת בינה מלאכותית שמנהלת לך את כל השיווק והמכירות —
          יחד עם צוות מומחים שמכוון, מפקח ואחראי על התוצאות. לא עוד תוכנה
          שמפעילים לבד, אלא שירות ומערכת בעבודה אחת.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <TalkButton size="lg" label="בוא נדבר על העסק שלך" />
          <Button asChild size="lg" variant="outline">
            <a href="#system">
              תראה איך זה עובד
              <ArrowDown />
            </a>
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          {HERO_POINTS.map((point) => (
            <li
              key={point}
              className="flex items-center gap-2 whitespace-nowrap"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {point}
            </li>
          ))}
        </ul>
      </div>
      <HeroVisual />
    </section>
  );
}

/** Decorative orb scene; the cards illustrate the UI, not live data. */
function HeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-square w-full max-w-md items-center justify-center"
    >
      <div className="absolute bottom-[12%] h-10 w-2/3 rounded-full bg-primary/30 blur-2xl" />
      <CarmenOrb className="h-[72%] w-[72%] animate-carmen-breathe" />
      <div className="material-glass absolute right-0 top-[8%] rounded-lg px-4 py-3 shadow-elevation-2">
        <p className="text-xs text-muted-foreground">כל שלב</p>
        <p className="text-sm font-bold">בפיקוח אנשי מקצוע.</p>
      </div>
      <div className="material-glass absolute bottom-[6%] left-0 flex gap-2 rounded-lg p-2.5 shadow-elevation-2">
        <Badge variant="draft">טיוטה</Badge>
        <Badge variant="active">פעיל</Badge>
        <Badge variant="progress">בתהליך</Badge>
      </div>
      <LeadsCard />
    </div>
  );
}

/** Sample KPI card in the brand style. */
function LeadsCard() {
  const bars = [35, 55, 70, 100];
  return (
    <div className="material-card absolute left-[4%] top-[18%] flex items-end gap-4 rounded-lg px-4 py-3">
      <div>
        <p className="text-xs text-muted-foreground">לידים</p>
        <p className="text-3xl font-extrabold leading-none">128</p>
      </div>
      <div className="flex h-10 items-end gap-1">
        {bars.map((height) => (
          <span
            key={height}
            className="w-1.5 rounded-full bg-primary"
            style={{ height: `${height}%`, opacity: 0.4 + height / 170 }}
          />
        ))}
      </div>
    </div>
  );
}
