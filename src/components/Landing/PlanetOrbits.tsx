import { AiosLogo } from "@/components/brand/AiosLogo";
import { CHANNEL_SPHERES, ChannelSphere } from "./ChannelSphere";
import { CENTER_LAYER, type Orbit, usePlanetOrbits } from "./usePlanetOrbits";

// One tilted ring with the spheres evenly spaced, moving together at one
// speed: balanced and orderly, and no two spheres ever collide.
const LAP_SECONDS = 26;

const ORBITS: Array<Orbit> = ring({ count: 7, tilt: -16, phaseOffset: 90 });

/** Evenly spaced orbits on one shared, tilted ring. */
function ring({
  count,
  tilt,
  phaseOffset,
}: {
  count: number;
  tilt: number;
  phaseOffset: number;
}): Array<Orbit> {
  return Array.from({ length: count }, (_, index) => ({
    radius: 41,
    period: LAP_SECONDS,
    direction: 1,
    elevation: 30,
    tilt,
    phase: phaseOffset + (index * 360) / count,
  }));
}

/** The AiOs logo with the channel spheres orbiting it like planets. */
export function PlanetOrbits() {
  const nodes = usePlanetOrbits(ORBITS);

  return (
    <div
      aria-hidden="true"
      className="relative isolate mx-auto aspect-square w-full max-w-xl"
    >
      <div className="orb-grid absolute inset-0" />
      <div className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-mint/15 blur-3xl" />
      <div
        className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2"
        style={{ zIndex: CENTER_LAYER }}
      >
        <AiosLogo tagline className="text-6xl md:text-7xl" />
      </div>
      {CHANNEL_SPHERES.map((spec, index) => (
        <div
          key={spec.id}
          ref={(element) => {
            nodes.current[index] = element;
          }}
          className="absolute w-[19%]"
        >
          <ChannelSphere spec={spec} showLabel={false} />
        </div>
      ))}
    </div>
  );
}
