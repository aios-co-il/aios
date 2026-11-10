import {
  AudienceSection,
  ClosingSection,
  LandingFooter,
} from "@/components/Landing/ClosingSections";
import { ControlSection } from "@/components/Landing/ControlSection";
import { DataSection } from "@/components/Landing/DataSection";
import { HeroSection } from "@/components/Landing/HeroSection";
import { JourneySection } from "@/components/Landing/JourneySection";
import { LandingNav } from "@/components/Landing/LandingNav";
import { ModulesSection } from "@/components/Landing/ModulesSection";
import { ShiftSection } from "@/components/Landing/ShiftSection";
import { useSignedInRedirect } from "@/components/Landing/useSignedInRedirect";

/** Public homepage (aios.co.il). Styled only with theme tokens. */
export default function Landing() {
  useSignedInRedirect();

  return (
    <div className="theme-mint min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingNav />
      <main>
        <HeroSection />
        <ShiftSection />
        <ModulesSection />
        <JourneySection />
        <DataSection />
        <ControlSection />
        <AudienceSection />
        <ClosingSection />
      </main>
      <LandingFooter />
    </div>
  );
}
