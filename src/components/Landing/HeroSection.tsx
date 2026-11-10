import { ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeroOrbs } from "./HeroOrbs";
import { TalkButton } from "./LandingNav";
import { BrandDot } from "./SectionHeading";

const HERO_POINTS = [
  "בינה מלאכותית שעובדת בשבילך",
  "אנשי מקצוע שמפקחים על כל שלב",
  "מערכת אחת לשיווק ולמכירות",
];

/** Headline, calls to action and the five-sphere channel scene. */
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
      <HeroOrbs />
    </section>
  );
}
