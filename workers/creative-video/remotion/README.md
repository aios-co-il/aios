# Carmen Remotion motion engine (initial implementation)

This package is deliberately isolated from the Vite browser application. `CarmenVideo` is the original demo. `WorkshopFilm` is the edit the render worker calls: it animates storyboard stills (or drops in a real video clip), sets Hebrew lower-thirds, and mixes narration and music. Remotion does not invent a person walking out of a flat image; that motion comes from Kling, ElevenLabs or Higgsfield, and the clip is then cut into this composition.

## Run locally

```bash
cd workers/creative-video/remotion
npm install
npx remotion compositions src/index.ts
npx remotion render src/index.ts CarmenVideo out.mp4 --codec h264 --concurrency 2
```

The built-in 31-second demo uses procedural visuals and Hebrew titles. It supports optional background/website/Carmen images and scene voiceover audio URLs via composition props. It is NOT integrated with the Creative Department, asset authorization, rendering queue or Supabase storage yet. Run on an isolated worker; do not render on the Vercel request path. All URLs must be resolved and staged by a tenant-authorized backend before passing props to Remotion. Do not allow arbitrary external URLs.
