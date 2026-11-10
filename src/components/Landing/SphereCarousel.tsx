import { ChannelSphere, SPHERES } from "./ChannelSphere";
import { carouselRef, RING, useCarousel } from "./useCarousel";

/**
 * The channel spheres on a turning ring, seen from the front: the sphere
 * facing the viewer rests, then the ring glides to the next one.
 */
export function SphereCarousel() {
  const nodes = useCarousel(SPHERES.length);

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto -mt-6 aspect-[1/0.62] w-full max-w-xl"
    >
      <div
        className="absolute h-[34%] w-full -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-white/70 bg-[radial-gradient(ellipse_at_50%_40%,hsl(var(--surface-elevated))_0%,hsl(var(--surface-inset))_65%,hsl(var(--border))_100%)] shadow-elevation-2"
        style={{ left: `${RING.centerX}%`, top: `${RING.centerY}%` }}
      />
      {SPHERES.map((spec, index) => (
        <div key={spec.id}>
          <div
            ref={carouselRef(nodes, index, "shadow")}
            className="absolute h-[7%] w-[20%] rounded-full blur-md"
            style={{
              background: `hsl(${spec.tint ?? "var(--primary)"} / 0.3)`,
            }}
          />
          <div
            ref={carouselRef(nodes, index, "item")}
            className="absolute w-[26%] origin-bottom"
          >
            <ChannelSphere spec={spec} showLabel={false} />
          </div>
        </div>
      ))}
    </div>
  );
}
