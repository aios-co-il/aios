import { useEffect, useRef } from "react";

/** Orbit geometry, in % of the scene box. */
export const ORBIT = {
  centerX: 50,
  /** Floor line through the center sphere's base. */
  centerY: 60,
  radiusX: 37,
  radiusY: 21,
};

const SECONDS_PER_LAP = 28;
/** Icon spin per radian of travel, so the marbles look like they roll. */
const ROLL_DEGREES_PER_RADIAN = 160;

/** Returns a ref callback that stores one element of marble `index`. */
export function marbleRef(
  nodes: { current: Array<MarbleNodes> },
  index: number,
  key: keyof MarbleNodes,
) {
  return function setNode(element: HTMLDivElement | null) {
    nodes.current[index] ??= { marble: null, shadow: null, icon: null };
    nodes.current[index][key] = element;
  };
}

export interface MarbleNodes {
  marble: HTMLDivElement | null;
  shadow: HTMLDivElement | null;
  icon: HTMLDivElement | null;
}

/**
 * Moves each marble around an ellipse on the floor every frame, writing
 * styles straight to the DOM (no React renders). Marbles grow and pass in
 * front of the center sphere on the near side, and shrink behind it on the
 * far side. With reduced motion the marbles hold their starting positions.
 */
export function useMarbleOrbit(startAngles: Array<number>) {
  const nodes = useRef<Array<MarbleNodes>>([]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    const startedAt = performance.now();

    function draw(now: number) {
      const travel = reduceMotion
        ? 0
        : ((now - startedAt) / 1000 / SECONDS_PER_LAP) * Math.PI * 2;
      startAngles.forEach((degrees, index) => {
        placeMarble(nodes.current[index], (degrees * Math.PI) / 180 + travel);
      });
      if (!reduceMotion) {
        frame = requestAnimationFrame(draw);
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [startAngles]);

  return nodes;
}

/** Positions one marble, its floor shadow and its rolling icon at `angle`. */
function placeMarble(node: MarbleNodes | undefined, angle: number) {
  if (!node?.marble || !node.shadow || !node.icon) {
    return;
  }
  const depth = Math.sin(angle); // -1 far side, 1 near side
  const scale = 0.78 + 0.22 * ((depth + 1) / 2);
  const x = ORBIT.centerX + ORBIT.radiusX * Math.cos(angle);
  const y = ORBIT.centerY + ORBIT.radiusY * depth;

  node.marble.style.left = `${x}%`;
  node.marble.style.top = `${y}%`;
  node.marble.style.transform = `translate(-50%, -100%) scale(${scale})`;
  node.marble.style.zIndex = depth > 0 ? "30" : "10";
  node.shadow.style.left = `${x}%`;
  node.shadow.style.top = `${y}%`;
  node.shadow.style.transform = `translate(-50%, -50%) scale(${scale})`;
  node.icon.style.transform = `rotate(${(angle * ROLL_DEGREES_PER_RADIAN) % 360}deg)`;
}
