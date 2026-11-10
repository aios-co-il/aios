import { useEffect, useRef } from "react";

export interface Orbit {
  /** Orbit radius, in % of the scene's width. */
  radius: number;
  /** Seconds per lap. */
  period: number;
  /** 1 or -1: which way the planet travels. */
  direction: 1 | -1;
  /** How far the orbit plane tips toward the viewer, in degrees. */
  elevation: number;
  /** Rotation of the orbit on screen, in degrees. */
  tilt: number;
  /** Starting position on the orbit, in degrees. */
  phase: number;
}

/** z-index of the center logo; planets in front go above it. */
export const CENTER_LAYER = 50;

/**
 * Moves each planet around its own tilted orbit every frame, writing styles
 * straight to the DOM (no React renders). Planets on the near side grow and
 * pass in front of the center; on the far side they shrink, soften and pass
 * behind it. With reduced motion the planets hold their starting positions.
 */
export function usePlanetOrbits(orbits: Array<Orbit>) {
  const nodes = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const startedAt = performance.now();

    function draw(now: number) {
      const seconds = reduceMotion ? 0 : (now - startedAt) / 1000;
      orbits.forEach((orbit, index) => {
        placePlanet(nodes.current[index], orbit, seconds);
      });
      if (!reduceMotion) {
        frame = requestAnimationFrame(draw);
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [orbits]);

  return nodes;
}

/** Projects one planet's 3D orbit position onto the scene at `seconds`. */
function placePlanet(
  node: HTMLDivElement | null | undefined,
  orbit: Orbit,
  seconds: number,
) {
  if (!node) {
    return;
  }
  const toRadians = Math.PI / 180;
  const angle =
    orbit.phase * toRadians +
    (orbit.direction * seconds * 2 * Math.PI) / orbit.period;
  const elevation = orbit.elevation * toRadians;
  const tilt = orbit.tilt * toRadians;

  // A circle in the horizontal plane, tipped toward the viewer, then turned.
  const flatX = orbit.radius * Math.cos(angle);
  const flatY = orbit.radius * Math.sin(angle) * Math.sin(elevation);
  const depth = Math.sin(angle) * Math.cos(elevation); // 1 = nearest
  const x = flatX * Math.cos(tilt) - flatY * Math.sin(tilt);
  const y = flatX * Math.sin(tilt) + flatY * Math.cos(tilt);

  // Strong size change sells the depth: far side about a third of the near.
  const nearness = (depth + 1) / 2;
  const scale = 0.45 + 0.85 * nearness ** 1.2;
  node.style.left = `${50 + x}%`;
  node.style.top = `${50 + y}%`;
  node.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
  node.style.zIndex = String(
    depth > 0
      ? CENTER_LAYER + 1 + Math.round(depth * 40)
      : 10 + Math.round(nearness * 30),
  );
  const far = 1 - nearness;
  node.style.filter = `blur(${(far * 2.2).toFixed(2)}px) saturate(${(1 - far * 0.55).toFixed(2)})`;
}
