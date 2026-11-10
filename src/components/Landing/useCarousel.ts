import { useEffect, useRef } from "react";

/** Ring geometry, in % of the scene box. A small radiusY = eye-level camera. */
export const RING = {
  centerX: 50,
  centerY: 64,
  radiusX: 41,
  radiusY: 11,
};

/** Seconds a sphere rests at the front, then seconds to glide to the next. */
const DWELL_SECONDS = 1.8;
const GLIDE_SECONDS = 1.1;

export interface CarouselNodes {
  item: HTMLDivElement | null;
  shadow: HTMLDivElement | null;
}

/** Returns a ref callback that stores one element of carousel item `index`. */
export function carouselRef(
  nodes: { current: Array<CarouselNodes> },
  index: number,
  key: keyof CarouselNodes,
) {
  return function setNode(element: HTMLDivElement | null) {
    nodes.current[index] ??= { item: null, shadow: null };
    nodes.current[index][key] = element;
  };
}

/**
 * Turns `count` items around a ring seen from the front: one item faces the
 * viewer, the one on the right moves away and the one on the left comes
 * closer. Each item rests at the front, then the ring glides one step.
 * Styles are written straight to the DOM every frame (no React renders).
 * With reduced motion the ring holds its first position.
 */
export function useCarousel(count: number) {
  const nodes = useRef<Array<CarouselNodes>>([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const startedAt = performance.now();

    function draw(now: number) {
      const offset = reduceMotion ? 0 : ringOffset((now - startedAt) / 1000);
      for (let index = 0; index < count; index += 1) {
        const angle = Math.PI / 2 + ((index - offset) * 2 * Math.PI) / count;
        placeItem(nodes.current[index], angle);
      }
      if (!reduceMotion) {
        frame = requestAnimationFrame(draw);
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [count]);

  return nodes;
}

/** Steps travelled after `seconds`: glide (eased), then rest, repeated. */
function ringOffset(seconds: number): number {
  const cycle = DWELL_SECONDS + GLIDE_SECONDS;
  const step = Math.floor(seconds / cycle);
  const phase = seconds - step * cycle;
  const glide = Math.min(phase / GLIDE_SECONDS, 1);
  return step + easeInOut(glide);
}

/** Smooth start and stop. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Positions one item and its floor shadow at `angle` on the ring. */
function placeItem(node: CarouselNodes | undefined, angle: number) {
  if (!node?.item || !node.shadow) {
    return;
  }
  const depth = Math.sin(angle); // 1 = facing the viewer, -1 = far back
  const nearness = (depth + 1) / 2;
  const scale = 0.45 + 0.55 * nearness;
  const x = RING.centerX + RING.radiusX * Math.cos(angle);
  const y = RING.centerY + RING.radiusY * depth;

  node.item.style.left = `${x}%`;
  node.item.style.top = `${y}%`;
  node.item.style.transform = `translate(-50%, -100%) scale(${scale})`;
  node.item.style.zIndex = String(Math.round(nearness * 100));
  // Opaque on purpose: transparency would let overlapping spheres blend.
  const far = 1 - nearness;
  node.item.style.filter = `blur(${(far * 2).toFixed(2)}px) saturate(${(1 - far * 0.7).toFixed(2)}) brightness(${(1 + far * 0.06).toFixed(3)})`;
  node.shadow.style.left = `${x}%`;
  node.shadow.style.top = `${y}%`;
  node.shadow.style.transform = `translate(-50%, -50%) scale(${scale})`;
  node.shadow.style.opacity = String(0.3 + 0.7 * nearness);
}
