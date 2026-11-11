import { useRef, useState } from "react";
import { normalizeHex } from "@/components/ui/colorHex";

const FALLBACK_COLOR = "#000000";

/**
 * Draft state behind `ColorPicker`: the spectrum and hex field edit a draft
 * that previews live, and `commit` reports a color to the caller at most once
 * per choice.
 */
export function useColorDraft(value: string, onChange: (hex: string) => void) {
  const savedColor = normalizeHex(value) ?? FALLBACK_COLOR;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(savedColor);
  const [hexText, setHexText] = useState(savedColor);
  // Blur, pointer-up and close can all fire for one choice before the parent
  // re-renders with the new value; remember what was sent to report it once.
  const lastCommitted = useRef(savedColor);

  /** Shows `hex` in the spectrum, preview swatch and hex field. */
  function showDraft(hex: string) {
    setDraft(hex);
    setHexText(hex);
  }

  /** Reports `hex` unless it is already saved or was just reported. */
  function commit(hex: string) {
    if (hex === savedColor || hex === lastCommitted.current) {
      return;
    }
    lastCommitted.current = hex;
    onChange(hex);
  }

  /** Starts each opening from the saved color and commits the draft on close. */
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      lastCommitted.current = savedColor;
      showDraft(savedColor);
    } else {
      commit(draft);
    }
    setOpen(nextOpen);
  }

  /** Applies a preset immediately and closes, like the old swatch grids. */
  function choosePreset(hex: string) {
    showDraft(hex);
    commit(hex);
    setOpen(false);
  }

  /** Keeps the typed text and previews it once it is a valid hex. */
  function changeHexText(text: string) {
    setHexText(text);
    const hex = normalizeHex(text);
    if (hex) {
      setDraft(hex);
    }
  }

  /** Commits a valid typed hex, or restores the draft's hex when invalid. */
  function confirmHexText() {
    const hex = normalizeHex(hexText);
    if (hex) {
      showDraft(hex);
      commit(hex);
    } else {
      setHexText(draft);
    }
  }

  return {
    open,
    savedColor,
    draft,
    hexText,
    hexIsValid: normalizeHex(hexText) !== null,
    showDraft,
    commitDraft: () => commit(draft),
    handleOpenChange,
    choosePreset,
    changeHexText,
    confirmHexText,
  };
}
