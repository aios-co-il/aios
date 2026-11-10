import { AiosLogo } from "./AiosLogo";
import { CHANNEL_SPHERES, ChannelSphere } from "./ChannelSphere";
import { CENTER_LAYER, type Orbit, usePlanetOrbits } from "./usePlanetOrbits";

// One orbit per channel sphere, in CHANNEL_SPHERES order: each with its own
// size, speed, direction and tilt, so the planets never move in step.
const ORBITS: Array<Orbit> = [
  { radius: 40, period: 20, direction: 1, elevation: 22, tilt: -32, phase: 20 },
  {
    radius: 36,
    period: 16,
    direction: -1,
    elevation: 28,
    tilt: 38,
    phase: 150,
  },
  { radius: 42, period: 26, direction: 1, elevation: 16, tilt: 12, phase: 260 },
  {
    radius: 34,
    period: 14,
    direction: -1,
    elevation: 34,
    tilt: -48,
    phase: 80,
  },
  { radius: 39, period: 23, direction: 1, elevation: 20, tilt: 54, phase: 320 },
  {
    radius: 41,
    period: 18,
    direction: -1,
    elevation: 26,
    tilt: -18,
    phase: 200,
  },
  { radius: 37, period: 29, direction: 1, elevation: 30, tilt: 26, phase: 110 },
];

/** The AiOs logo with the channel spheres orbiting it like planets. */
export function PlanetOrbits() {
  const nodes = usePlanetOrbits(ORBITS);

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-square w-full max-w-xl"
    >
      <div className="absolute left-1/2 top-1/2 h-1/2 w-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-mint/15 blur-3xl" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
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
