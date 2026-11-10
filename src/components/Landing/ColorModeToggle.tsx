import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ColorMode } from "./useColorMode";

interface ColorModeToggleProps {
  mode: ColorMode;
  onToggle: () => void;
}

/** Sun/moon button that switches the page between light and dark. */
export function ColorModeToggle({ mode, onToggle }: ColorModeToggleProps) {
  const isDark = mode === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
      aria-pressed={isDark}
      onClick={onToggle}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
