import { Link } from "react-router-dom";
import { ArrowUpLeft } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { BrandWordmark } from "./BrandWordmark";
import { TalkButton } from "./LandingNav";
import { Reveal } from "./Reveal";
import { BrandDot, SectionHeading } from "./SectionHeading";
import { AUDIENCES, LEGAL_LINKS } from "./landingContent";

/** Who AIOS is for. */
export function AudienceSection() {
  return (
    <section className="border-y bg-card">
      <Reveal className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <SectionHeading
          kicker="06 / BUILT TO SCALE"
          title="לעסק אחד."
          subtitle="או למאה לקוחות."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((item) => (
            <div
              key={item.title}
              className="rounded-lg border bg-background p-6 transition-shadow hover:shadow-elevation-2"
            >
              <ArrowUpLeft className="h-5 w-5 text-primary" />
              <h3 className="mt-6 text-xl font-bold">{item.title}</h3>
              <p className="mt-2 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/** Final call to action on a navy panel with Carmen's orb. */
export function ClosingSection() {
  return (
    <section id="contact" className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <Reveal className="dark relative overflow-hidden rounded-lg bg-background px-6 py-16 text-center text-foreground md:py-20">
        <CarmenOrb className="mx-auto h-20 w-20" />
        <SectionHeading
          kicker="READY FOR WHAT'S NEXT?"
          title="בוא נדבר על"
          subtitle={
            <>
              העסק שלך
              <BrandDot />
            </>
          }
          className="mx-auto mt-8"
        >
          אני כרמן. בוא נראה איך אפשר לחבר את כל השיווק והמכירות שלך למקום אחד.
        </SectionHeading>
        <div className="mt-8 flex justify-center">
          <TalkButton size="lg" label="בואו נכיר" />
        </div>
      </Reveal>
    </section>
  );
}

/** Wordmark, copyright and legal links. */
export function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:px-6">
        <BrandWordmark className="text-base text-foreground" />
        <span>© {new Date().getFullYear()} AIOS</span>
        <nav className="flex items-center gap-2.5" aria-label="מידע משפטי">
          {LEGAL_LINKS.map((link, index) => (
            <span key={link.to} className="flex items-center gap-2.5">
              {index > 0 && <span aria-hidden="true">·</span>}
              <Link to={link.to} className="hover:text-foreground">
                {link.label}
              </Link>
            </span>
          ))}
        </nav>
        <a href="#top" className="hover:text-foreground">
          חזרה למעלה ↑
        </a>
      </div>
    </footer>
  );
}
