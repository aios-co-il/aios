import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { TalkButton } from "./LandingNav";
import { BrandDot } from "./SectionHeading";

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
          מנהלת השיווק
          <br />
          החדשה שלך
          <BrandDot />
        </h1>
        <div className="mt-6 h-1 w-14 rounded-full bg-primary" />
        <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">
          העסק שלך לא צריך עוד קמפיין. הוא צריך מישהי שתחבר את כל השיווק,
          המכירות והניהול — למקום אחד.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <TalkButton size="lg" label="בוא נדבר על העסק שלך" />
          <Button asChild size="lg" variant="outline">
            <a href="#system">
              תראה מה אני עושה
              <ArrowDown />
            </a>
          </Button>
        </div>
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
        <p className="text-xs text-muted-foreground">כל השיווק</p>
        <p className="text-sm font-bold">במקום אחד.</p>
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
