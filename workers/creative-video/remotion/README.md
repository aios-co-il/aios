# Carmen Remotion motion engine (initial implementation)

This package is deliberately isolated from the Vite browser application. It is an actual frame-by-frame motion composition, not FFmpeg zooming on a still. It animates the website, floating devices, underwater particles, camera movement, titles and transitions. For production-quality human motion, supply transparent character animation assets or rendered AI video clips; Remotion does not infer articulated motion from a flat image.

## Run locally

```bash
cd workers/creative-video/remotion
npm install
npx remotion compositions src/index.ts
npx remotion render src/index.ts CarmenVideo out.mp4 --codec h264 --concurrency 2
```

The built-in 31-second demo uses procedural visuals and Hebrew titles. It supports optional background/website/Carmen images and scene voiceover audio URLs via composition props. It is NOT integrated with the Creative Department, asset authorization, rendering queue or Supabase storage yet. Run on an isolated worker; do not render on the Vercel request path. All URLs must be resolved and staged by a tenant-authorized backend before passing props to Remotion. Do not allow arbitrary external URLs.
