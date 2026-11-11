import type { KeyboardEvent } from "react";
import { HexColorPicker } from "react-colorful";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { normalizeHex } from "@/components/ui/colorHex";
import { useColorDraft } from "@/components/ui/useColorDraft";
import { cn } from "@/lib/utils";
import { AIOS_BRAND } from "@/theme/brand";

/** Quick picks shown under the spectrum: the brand colors, then common label hues. */
const PRESET_COLORS = [
  AIOS_BRAND.accent,
  AIOS_BRAND.ink,
  "#ef4444",
  "#f97316",
  "#eab308",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#9ca3af",
].map((hex) => normalizeHex(hex) ?? hex);

interface ColorPickerProps {
  /** The saved color as a hex string. */
  value: string;
  /** Called with a lowercase `#rrggbb` once the user settles on a color. */
  onChange: (hex: string) => void;
  /** Id for the trigger button, so a `<Label htmlFor>` can point at it. */
  id?: string;
  /** Accessible name of the trigger button. */
  label?: string;
  /** Classes for the trigger swatch (size and shape). */
  className?: string;
  disabled?: boolean;
}

/**
 * A swatch button that opens a full-spectrum picker (saturation/brightness
 * area and hue slider), preset colors and a hex field. Dragging only previews:
 * `onChange` fires when a drag or key press ends, a preset is clicked, a valid
 * hex is confirmed, or the popover closes, so callers that save on every
 * change do not write once per pointer move.
 */
export function ColorPicker({
  value,
  onChange,
  id,
  label = "בחירת צבע",
  className,
  disabled,
}: ColorPickerProps) {
  const picker = useColorDraft(value, onChange);

  /** Confirms the typed hex on Enter without submitting a surrounding form. */
  function handleHexKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      picker.confirmHexText();
    }
  }

  return (
    <Popover open={picker.open} onOpenChange={picker.handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={label}
          disabled={disabled}
          className={cn(
            "h-8 w-8 shrink-0 rounded-md border-2 border-border ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
          style={{
            backgroundColor: picker.open ? picker.draft : picker.savedColor,
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-3 p-3" align="start">
        {/* The spectrum and hex code read left to right in every locale. */}
        <div
          dir="ltr"
          onPointerUp={picker.commitDraft}
          onKeyUp={picker.commitDraft}
        >
          <HexColorPicker
            color={picker.draft}
            onChange={picker.showDraft}
            style={{ width: "100%", height: 160 }}
          />
        </div>
        <div
          className="grid grid-cols-5 gap-1.5"
          role="group"
          aria-label="צבעים מוכנים"
        >
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={preset}
              aria-pressed={picker.draft === preset}
              className={cn(
                "h-7 w-full rounded-md border border-border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                picker.draft === preset &&
                  "ring-2 ring-ring ring-offset-1 ring-offset-popover",
              )}
              style={{ backgroundColor: preset }}
              onClick={() => picker.choosePreset(preset)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2" dir="ltr">
          <span
            aria-hidden
            className="h-8 w-8 shrink-0 rounded-md border border-border"
            style={{ backgroundColor: picker.draft }}
          />
          <Input
            type="text"
            aria-label="קוד צבע"
            aria-invalid={!picker.hexIsValid}
            value={picker.hexText}
            onChange={(event) => picker.changeHexText(event.target.value)}
            onBlur={picker.confirmHexText}
            onKeyDown={handleHexKeyDown}
            placeholder="#000000"
            spellCheck={false}
            className={cn(
              "h-8 text-left font-mono text-sm",
              !picker.hexIsValid &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
