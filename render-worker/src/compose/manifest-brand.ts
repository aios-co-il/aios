/** The film's brand as the Remotion manifest takes it: colours, font, logo and call to action. */
import { brandColor, brandFont } from "./brand.ts";
import { MAX_CTA_CHARS, ctaLines } from "./end-card.ts";
import { extension } from "./manifest-media.ts";

/** The brand for the end card, its logo staged in `files`; null when nothing of it is set. */
export function brandOf(brand, files): ManifestBrand | null {
  if (!brand) return null;
  let logo = null;
  if (brand.logoPath) {
    logo = `logo.${extension(brand.logoPath)}`;
    files.push({ from: brand.logoPath, to: logo });
  }
  const out: ManifestBrand = {
    primaryColor: brandColor(brand.primaryColor),
    secondaryColor: brandColor(brand.secondaryColor),
    logo,
    fontFamily: brandFont(brand.fontFamily),
    ctaText:
      String(brand.ctaText ?? "")
        .trim()
        .slice(0, MAX_CTA_CHARS) || null,
    ctaUrl:
      String(brand.ctaUrl ?? "")
        .trim()
        .slice(0, 120) || null,
  };
  if (!Object.values(out).some(Boolean)) return null;
  // A whole-sentence call to action is shown in up to three balanced lines (end-card.ts).
  return out.ctaText ? { ...out, ctaLines: ctaLines(out.ctaText) } : out;
}

/** The brand as the Remotion manifest takes it (WorkshopBrand in the Remotion manifest.ts). */
interface ManifestBrand {
  primaryColor: string;
  secondaryColor: string;
  logo: string | null;
  fontFamily: string;
  ctaText: string | null;
  ctaUrl: string | null;
  ctaLines?: Array<string>;
}
