# AIOS render worker

Long-running Node service for Video Studio jobs that cannot run in Supabase Edge Functions (ffmpeg, and Remotion in phase 6). It claims queued `marketing_runs` rows by `kind` with `claim_video_run` (service role only, `FOR UPDATE SKIP LOCKED`), runs up to `CONCURRENCY` (8) of them at once, and writes `output`, `cost_usd`, `credits` and status back. Failed runs are re-queued up to `MAX_ATTEMPTS` (3); each run fails on its own, so one bad clip never stops the others.

Handled kinds:

- `reference_analysis` (phase 3). Input is `{ bucket, path, asset_id }` of an uploaded reference video in `creative-video`, up to 180 s. The worker:
  1. finds shots with ffmpeg scene cuts (cuts under 0.6 s are dropped, and more than 24 shots are merged down);
  2. saves a keyframe per shot to `<path dir>/frames/`;
  3. transcribes word by word with ElevenLabs Scribe, or Whisper when no ElevenLabs key is set;
  4. describes every shot in a single vision call;
  5. writes `output.proposal.frames`: one frame per reference shot with the same durations. The proposal copies pace, rhythm and camera language only, never characters, brands, logos, text or dialogue.

- `clip` (phase 4). Queued by `queue_video_clips` with `{ scene_id, client_id, still_url, still_asset_id, motion_prompt, duration_s, aspect, estimate }`. The worker:
  1. sends the still and the motion prompt (always ending in "No text, no letters, no logos.") to `VIDEO_PROVIDER`;
  2. stores the job id on the run;
  3. polls every 10 s for up to 15 minutes;
  4. saves the MP4 to `creative-video/<tenant>/<client>/<item>/<scene>/clip-v<n>.mp4`;
  5. attaches it with `attach_video_scene_asset`, which sets the scene to `clip_ready`.

  A retried run with a provider job id resumes polling and does not pay again. After the last attempt the scene is set to `failed`.

### Video providers

Every provider implements `estimate / submit / poll` (`src/providers/`), so changing provider touches only that folder.

- `mock` (default): a free ffmpeg Ken Burns push-in on the still. Use it on Staging to exercise the full flow without spending.
- `kling`: the official Kling image-to-video API. It takes a JWT from `KLING_ACCESS_KEY` and `KLING_SECRET_KEY`, and `KLING_BASE_URL`, `KLING_MODEL` and `KLING_MODE` override the defaults. The request shape follows the published v1 `image2video` API; confirm it with one paid test clip before turning it on. Cost is estimated at about $0.85 (5,100 credits) per 5 s pro clip, and 10 s for scenes longer than 5 s.

No dependencies beyond Node 22 and ffmpeg.

## Run on the Droplet

```bash
git clone … && cd aios/render-worker
cp .env.example .env   # fill in the Staging project URL and service-role key
docker build -t aios-render-worker .
docker run -d --name aios-render-worker --restart unless-stopped --env-file .env aios-render-worker
docker logs -f aios-render-worker
```

Give the Droplet at least 4 vCPUs; Remotion renders in phase 6 run on this same worker.

## Test

```bash
node --test test/*.test.mjs   # the ffmpeg test needs ffmpeg on PATH and skips otherwise
```
