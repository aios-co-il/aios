import { useEffect, useRef } from "react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import {
  buildPath,
  FIRST_DROP_SCROLL,
  poseAt,
  type TrackLine,
} from "./rollingOrbPath";

const SIZE = 40;

/**
 * Headings marked `data-orb-track` are the orb's track, in page order; the
 * header orb marked `data-orb-home` is where it starts (and is hidden while
 * the rolling orb is out).
 *
 * An orb that leaves the header as you scroll, rolls along the top of each
 * marked heading (alternating direction) and falls to the next one. Tied to
 * the scroll position, so scrolling up rolls it back. Not shown with
 * reduced motion; the header orb stays instead.
 */
export function RollingOrb() {
  const originRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const spinRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    document.body.classList.add("orb-traveling");
    let frame = 0;

    function draw() {
      frame = 0;
      const orb = orbRef.current;
      const spin = spinRef.current;
      const origin = originRef.current?.getBoundingClientRect();
      // Measured every frame: headings shift as sections reveal and resize.
      const path = measurePath();
      if (!orb || !spin || !origin || path.length === 0) {
        return;
      }
      const pose = poseAt(path, window.scrollY);
      const top = pose.y - window.scrollY;
      // Starts at the header orb's size, so it covers exactly that orb, and
      // grows to full size during the first drop.
      const growth = Math.min(window.scrollY / FIRST_DROP_SCROLL, 1);
      const size = homeScale() + (1 - homeScale()) * growth;
      // The fixed layer's origin is not always the screen edge (the page
      // reserves scrollbar space on both sides), so offset by it.
      const x = pose.x - origin.left - SIZE / 2;
      const y = top - origin.top - SIZE / 2;
      orb.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${size * (2 - pose.squash)}, ${size * pose.squash})`;
      orb.style.opacity = "1";
      // Rolling without slipping: turn by distance travelled over the radius.
      spin.style.transform = `rotate(${(pose.x / (SIZE / 2)) * (180 / Math.PI)}deg)`;
    }

    function schedule() {
      if (!frame) {
        frame = requestAnimationFrame(draw);
      }
    }

    // The logo moves when its web font arrives; re-place the orb then too.
    const logo = document.querySelector(
      "header [data-orb-home]",
    )?.parentElement;
    const observer = new ResizeObserver(schedule);
    if (logo) {
      observer.observe(logo);
    }
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    schedule();
    return () => {
      document.body.classList.remove("orb-traveling");
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={originRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[60]"
    >
      <div
        ref={orbRef}
        className="absolute left-0 top-0 opacity-0 will-change-transform"
        style={{ width: SIZE, height: SIZE }}
      >
        <CarmenOrb className="h-full w-full">
          <span
            ref={spinRef}
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_72%_70%,hsl(var(--brand-mint)/0.55),transparent_42%)]"
          />
        </CarmenOrb>
      </div>
    </div>
  );
}

/** The header orb's size relative to the rolling orb. */
function homeScale(): number {
  const home = document.querySelector("header [data-orb-home]");
  const width = home?.getBoundingClientRect().width;
  return width ? width / SIZE : 1;
}

/** Reads the header orb and the marked headings, and builds the path. */
function measurePath() {
  const home = document.querySelector("header [data-orb-home]");
  const homeRect = home?.getBoundingClientRect();
  const headings = Array.from(document.querySelectorAll("[data-orb-track]"));
  const tracks = headings.map(firstLine);
  // The header is sticky at the top, so its screen position is its position
  // at scroll 0.
  const start = homeRect
    ? {
        x: homeRect.left + homeRect.width / 2,
        y: homeRect.top + homeRect.height / 2,
      }
    : { x: window.innerWidth - 40, y: 32 };
  return buildPath(start, tracks, SIZE / 2, window.innerHeight);
}

/** Page position of a heading's first line of text. */
function firstLine(element: Element): TrackLine {
  const range = document.createRange();
  range.selectNodeContents(element);
  const first = range.getClientRects()[0] ?? element.getBoundingClientRect();
  return {
    left: first.left,
    right: first.right,
    top: first.top + window.scrollY,
  };
}
