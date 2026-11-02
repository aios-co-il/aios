import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { aspectRatioOf, shimmerCell } from "./shimmer";

const CELL = 11;
const GAP = 2;
const FRAME_MS = 1000 / 30;

/**
 * The "Carmen is creating" surface: waves of pixels that glow and drift until the real image
 * replaces it. Draws on a canvas, stops when hidden, and holds a still frame for users who
 * ask for reduced motion.
 */
export function MagicShimmer({
  format,
  label,
  className,
}: {
  format?: string;
  label?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const ratio = aspectRatioOf(format);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = box.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!el || !cv || !ctx) return;
    const still = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let raf = 0;
    let last = 0;
    let width = 0;
    let height = 0;

    const draw = (now: number) => {
      const t = now / 1000;
      const step = CELL + GAP;
      const cols = Math.max(1, Math.floor(width / step));
      const rows = Math.max(1, Math.floor(height / step));
      const offsetX = (width - cols * step + GAP) / 2;
      const offsetY = (height - rows * step + GAP) / 2;
      ctx.clearRect(0, 0, width, height);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = shimmerCell(col, row, cols, rows, t);
          ctx.fillStyle = `hsla(${cell.hue}, 85%, ${cell.lightness}%, ${cell.alpha})`;
          ctx.beginPath();
          ctx.roundRect(
            offsetX + col * step,
            offsetY + row * step,
            CELL,
            CELL,
            3,
          );
          ctx.fill();
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = el.clientWidth;
      height = el.clientHeight;
      cv.width = Math.round(width * dpr);
      cv.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={box}
      role="status"
      aria-label={label ?? "כרמן יוצרת"}
      style={{
        aspectRatio: String(ratio),
        width: `min(100%, ${(ratio * 72).toFixed(2)}vh)`,
      }}
      className={cn(
        "relative mx-auto max-w-md overflow-hidden rounded-xl bg-[#061225]",
        className,
      )}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,18,37,0.55),transparent_65%)]" />
      {label ? (
        <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-white/90 drop-shadow">
          {label}
        </p>
      ) : null}
    </div>
  );
}
