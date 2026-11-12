import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CarmenOrbBuddy } from "@/components/carmen/CarmenOrbBuddy";
import { MiniMe } from "@/components/carmen/MiniMe/MiniMe";
import { useKnownCarmenAvatarStyle } from "@/hooks/useCarmenAvatarStyle";

/**
 * Carmen at work, in the organization's style (AIO-543). The orb works live in
 * CSS (`CarmenOrbBuddy`, working state). The character is a 5-second silent
 * loop of Carmen typing (she turns to wink halfway, so a frame swap could not
 * line up), 640×480 and about 75 KB; its first frame is the poster, shown at
 * once and alone under reduced motion.
 */

const SCENE_VIDEO = "/carmen/carmen-working.mp4";
const SCENE_POSTER = "/carmen/carmen-working.webp";

let posterPrefetched = false;

/** Warm the browser cache so the loader itself never arrives late. */
function prefetchCarmenPoster() {
  if (posterPrefetched || typeof window === "undefined") {
    return;
  }
  posterPrefetched = true;
  const img = new Image();
  img.src = SCENE_POSTER;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type CarmenSceneSize = "sm" | "md" | "lg";

const SCENE_WIDTH: Record<CarmenSceneSize, string> = {
  sm: "w-[164px]",
  md: "w-[300px]",
  lg: "w-[420px]",
};

/** The animated scene on its own — Carmen working, without any copy around it. */
export function CarmenWorkingScene({
  size = "md",
  className,
}: {
  size?: CarmenSceneSize;
  className?: string;
}) {
  const style = useKnownCarmenAvatarStyle();
  return style === "character" ? (
    <CharacterWorkingScene size={size} className={className} />
  ) : (
    <OrbWorkingScene
      size={size}
      className={className}
      miniMe={style === "minime"}
    />
  );
}

/** The Mini Me or the glass orb at work, on a card that follows light or dark mode. */
function OrbWorkingScene({
  size,
  className,
  miniMe,
}: {
  size: CarmenSceneSize;
  className?: string;
  miniMe: boolean;
}) {
  return (
    <div className={cn("relative", SCENE_WIDTH[size], className)}>
      {/* Deep green glass on the light card; dark mode turns it see-through. */}
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-[radial-gradient(ellipse_at_55%_40%,hsl(var(--brand-accent-100)),hsl(var(--card))_80%)] shadow-elevation-2 dark:bg-[#0b1020] dark:bg-none dark:shadow-[0_18px_45px_-20px_rgba(15,23,42,0.75)]">
        {miniMe ? (
          <MiniMe state="working" className="w-[46%]" />
        ) : (
          <CarmenOrbBuddy state="working" className="orb-deep w-[62%]" />
        )}
      </div>
    </div>
  );
}

/** Carmen the character typing: the looping clip with light and data effects. */
function CharacterWorkingScene({
  size,
  className,
}: {
  size: CarmenSceneSize;
  className?: string;
}) {
  useEffect(prefetchCarmenPoster, []);
  const [still] = useState(prefersReducedMotion);

  return (
    <div
      className={cn(
        "relative animate-carmen-breathe motion-reduce:animate-none",
        SCENE_WIDTH[size],
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-primary/15 bg-[#0b1020] shadow-[0_18px_45px_-20px_rgba(15,23,42,0.75)]">
        {still ? (
          <img
            src={SCENE_POSTER}
            alt=""
            aria-hidden
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <video
            src={SCENE_VIDEO}
            poster={SCENE_POSTER}
            aria-hidden
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Keyboard light spill, tied to the keystroke rhythm. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-[48%] right-[22%] bottom-[2%] h-[14%] animate-carmen-screen-flicker rounded-full bg-sky-400/40 blur-2xl motion-reduce:animate-none"
        />

        {/* Data bits lifting off the keyboard toward the holo panels. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="absolute bottom-[10%] h-1.5 w-1.5 rounded-[2px] bg-cyan-300/90 animate-carmen-data-rise motion-reduce:hidden"
              style={{ left: `${55 + i * 5}%`, animationDelay: `${i * 0.8}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
