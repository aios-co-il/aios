import { Moon, Sun } from "lucide-react";
import { CarmenOrb } from "@/components/carmen/CarmenOrb";
import { cn } from "@/lib/utils";
import type { ColorMode } from "./useColorMode";

interface ColorModeToggleProps {
  mode: ColorMode;
  onToggle: () => void;
}

/** On/off style switch between day (sun) and night (moon), with an orb knob. */
export function ColorModeToggle({ mode, onToggle }: ColorModeToggleProps) {
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      role="switch"
      dir="ltr"
      aria-checked={isDark}
      aria-label="מצב כהה"
      onClick={onToggle}
      className="relative inline-flex h-8 w-[3.75rem] shrink-0 items-center justify-between rounded-full border bg-surface-inset px-2 text-muted-foreground shadow-inner transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Sun className={cn("h-3.5 w-3.5", !isDark && "opacity-0")} />
      <Moon className={cn("h-3.5 w-3.5", isDark && "opacity-0")} />
      <span
        className={cn(
          "absolute left-1 top-1 h-6 w-6 transition-transform duration-300 ease-out motion-reduce:transition-none",
          isDark && "translate-x-7",
        )}
      >
        <CarmenOrb className="flex h-full w-full">
          {isDark ? (
            <Moon className="relative h-3 w-3 text-foreground" />
          ) : (
            <Sun className="relative h-3 w-3 text-foreground" />
          )}
        </CarmenOrb>
      </span>
    </button>
  );
}
