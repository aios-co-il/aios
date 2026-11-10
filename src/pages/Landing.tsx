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
import { RollingOrb } from "@/components/Landing/RollingOrb";
import { ShiftSection } from "@/components/Landing/ShiftSection";
import { useColorMode } from "@/components/Landing/useColorMode";
import { useSignedInRedirect } from "@/components/Landing/useSignedInRedirect";
import { cn } from "@/lib/utils";

/** Public homepage (aios.co.il). Styled only with theme tokens. */
export default function Landing() {
  useSignedInRedirect();
  const { mode, toggle } = useColorMode();

  return (
    <div
      className={cn(
        "min-h-screen overflow-x-clip bg-background text-foreground",
        mode === "dark" && "dark",
      )}
    >
      <LandingNav mode={mode} onToggleMode={toggle} />
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
      <RollingOrb />
    </div>
  );
}
