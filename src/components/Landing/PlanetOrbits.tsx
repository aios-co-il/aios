import { AiosLogo } from "./AiosLogo";
import { CHANNEL_SPHERES, ChannelSphere } from "./ChannelSphere";
import { CENTER_LAYER, type Orbit, usePlanetOrbits } from "./usePlanetOrbits";

// One orbit per channel sphere, in CHANNEL_SPHERES order: each with its own
// size, speed, direction and tilt, so the planets never move in step.
const ORBITS: Array<Orbit> = [
  { radius: 44, period: 22, direction: 1, elevation: 42, tilt: -14, phase: 20 },
  {
    radius: 38,
    period: 17,
    direction: -1,
    elevation: 58,
    tilt: 28,
    phase: 150,
  },
  { radius: 46, period: 28, direction: 1, elevation: 36, tilt: 8, phase: 260 },
  {
    radius: 36,
    period: 15,
    direction: -1,
    elevation: 64,
    tilt: -34,
    phase: 80,
  },
  { radius: 42, period: 25, direction: 1, elevation: 48, tilt: 46, phase: 320 },
  {
    radius: 45,
    period: 20,
    direction: -1,
    elevation: 40,
    tilt: -48,
    phase: 200,
  },
  { radius: 39, period: 31, direction: 1, elevation: 54, tilt: 16, phase: 110 },
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
          className="absolute w-[14%]"
        >
          <ChannelSphere spec={spec} showLabel={false} />
        </div>
      ))}
    </div>
  );
}
