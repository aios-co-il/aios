import { Reveal } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { JOURNEY_STEPS } from "./landingContent";

/** From a new lead to a team task, in four steps. */
export function JourneySection() {
  return (
    <section id="workflow" className="border-y bg-card">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
        <Reveal>
          <SectionHeading
            kicker="03 / FROM LEAD TO ACTION"
            title="ליד נכנס."
            subtitle="אני כבר על זה."
          >
            פחות לעבור בין מערכות. יותר לדעת מה קורה בכל שלב.
          </SectionHeading>
        </Reveal>
        <ol className="relative mt-14 grid gap-8 md:grid-cols-4 md:gap-6">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-[2.15rem] hidden h-px bg-border md:block"
          />
          {JOURNEY_STEPS.map((step) => (
            <li key={step.n}>
              <Reveal>
                <span className="text-xs font-semibold text-muted-foreground">
                  {step.n}
                </span>
                <span className="relative mt-3 block h-3 w-3 rounded-full bg-primary ring-4 ring-success" />
                <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
                <p className="mt-1 text-muted-foreground">{step.desc}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
