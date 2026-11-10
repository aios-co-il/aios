import type { BrandColors } from "./brand";
import { buildThemeTokens, type ThemeTokens } from "./tokens";

const STYLE_ELEMENT_ID = "brand-theme";

/**
 * Writes the theme as a stylesheet (`:root` and `.dark`) instead of inline
 * styles on <html>, so the dark-mode class can still override light values.
 */
export function applyBrandTheme(brand: BrandColors): void {
  const css = [
    `:root {${declarations(buildThemeTokens(brand, "light"))}}`,
    `.dark {${declarations(buildThemeTokens(brand, "dark"))}}`,
  ].join("\n");
  styleElement().textContent = css;
}

/** Serializes tokens as CSS custom property declarations. */
function declarations(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([name, value]) => `--${name}: ${value};`)
    .join(" ");
}

/** Returns the single theme <style> element, creating it on first use. */
function styleElement(): HTMLStyleElement {
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }
  const element = document.createElement("style");
  element.id = STYLE_ELEMENT_ID;
  document.head.appendChild(element);
  return element;
}
