# Carmen Creative Video — initial renderer

This is an **initial tested FFmpeg rendering engine**, not the completed Creative Department integration.

## Current capabilities
- Takes a schemaVersion=1 video manifest produced by `buildVideoRenderManifest`.
- Renders generated storyboard still images to H.264 MP4, maintaining exact 30fps frame counts and aspect ratios.
- Concatenates scenes deterministically. Uses FFmpeg installed on an isolated Node worker.
- Accepts **local staged file:// assets only**. This prevents browser-controlled remote URL fetching / SSRF.

## Local invocation
```sh
node workers/creative-video/cli.mjs manifest.json result.mp4
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1 result.mp4
```

## Deployment prerequisites (NOT YET IMPLEMENTED)
1. Authenticated queue + tenant authorization, idempotency and job progress.
2. Asset staging service: resolve only tenant-authorized Supabase Storage asset IDs, download to local scratch disk; never pass client-supplied remote URLs.
3. Dedicated render worker with FFmpeg installed, storage uploads, cancellation, retries and cost metering.
4. Wire render action, status polling, playback and approval into CreativeDepartment.
5. Remotion compositions for editable Hebrew typography, transitions, animation, voiceover, captions, soundtrack. FFmpeg currently produces static-image clips only.
6. End-to-end staging verification and security tests before production merge.

## Validation
An isolated smoke test was executed locally with two 45-frame scenes at 30fps. FFprobe reported a playable 3.000-second MP4 at 360x640. This does not validate the deployed application.
