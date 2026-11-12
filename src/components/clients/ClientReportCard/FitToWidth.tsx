import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type Props = {
  /** The narrowest width the content lays out at; a narrower card scales it down. */
  minWidth: number;
  children: ReactNode;
};

/**
 * Fits a share page into the client card. At or above `minWidth` the page
 * lays out at the card's width (its own responsive layout); below it the page
 * lays out at `minWidth` and is scaled down to the card's width, so a narrow
 * card shows the whole report instead of a cramped or clipped one. The share
 * pages are full-screen routes, so their `min-h-screen` is dropped here.
 */
export function FitToWidth({ minWidth, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const fit = useFit(outerRef, innerRef, minWidth);
  const scaled = fit.scale < 1;

  return (
    <div
      ref={outerRef}
      className="relative w-full overflow-hidden"
      style={scaled ? { height: fit.height } : undefined}
    >
      <div
        ref={innerRef}
        className="[&_.min-h-screen]:min-h-0"
        style={
          scaled
            ? {
                position: "absolute",
                top: 0,
                right: 0,
                width: minWidth,
                transform: `scale(${fit.scale})`,
                // The card is right-to-left: keep the page's right edge in place.
                transformOrigin: "top right",
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

/** The scale that fits the content into the card, and the scaled height it takes. */
function useFit(
  outerRef: RefObject<HTMLDivElement>,
  innerRef: RefObject<HTMLDivElement>,
  minWidth: number,
) {
  const [fit, setFit] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner || typeof ResizeObserver === "undefined") {
      return;
    }
    /** Recomputes the fit from the card's width and the content's height. */
    function update() {
      if (!outer || !inner) {
        return;
      }
      const width = outer.clientWidth;
      const scale = width > 0 && width < minWidth ? width / minWidth : 1;
      // offsetHeight ignores the transform, so it is the unscaled height.
      setFit({ scale, height: Math.ceil(inner.offsetHeight * scale) });
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [outerRef, innerRef, minWidth]);

  return fit;
}
