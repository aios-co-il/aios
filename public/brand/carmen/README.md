# Carmen Marketing OS - approved soft brand assets

These are the original, user-approved raster images. Do not redraw, retype, recolor, or substitute them with CSS or SVG artwork.

## Website assets

| Asset | WebP | PNG | Dimensions |
| --- | --- | --- | --- |
| Text-only wordmark | `wordmark-soft.webp` | `wordmark-soft.png` | 1682 x 754 |
| Standalone C symbol | `symbol-soft.webp` | `symbol-soft.png` | 1172 x 1058 |

- Header and footer: `/brand/carmen/wordmark-soft.webp`. The wordmark contains no standalone symbol. The original artwork preserves the approved spacing between Marketing and OS.
- Hero: `/brand/carmen/symbol-soft.webp`. Keep it separate from the wordmark and preserve its aspect ratio. The landing page uses opacity 0.8 (20% transparency), not opacity 0.2.
- Both formats retain an alpha channel and transparent safety margins. WebP exports use lossless compression.
- Source PNGs are retained as `wordmark-soft-source.png` and `symbol-soft-source.png`, with archive copies under `design/brand/carmen/approved-soft-sources/`.
- `soft-assets.json` records the export dimensions and SHA-256 checksums of the approved source files.

The website now references the two WebP files directly. The old root-level `/carmen-wordmark.svg` and `/carmen-symbol.svg` are rejected reconstructions and must not be used for the brand.

No separate magnetic background texture has been approved and installed in this directory. Do not reference a nonexistent texture file or invent a replacement.
