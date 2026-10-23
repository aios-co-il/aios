# AIOS render worker

Long-running Node service for Video Studio jobs that cannot run in Supabase Edge Functions (ffmpeg). It claims queued `marketing_runs` rows by `kind` with `claim_video_run` (service role only, `FOR UPDATE SKIP LOCKED`), runs up to `CONCURRENCY` (8) of them at once, and writes `output`, `cost_usd`, `credits` and status back. Failed runs are re-queued up to `MAX_ATTEMPTS` (3); each run fails on its own, so one bad clip never stops the others.

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

- `voice` and `music` (phase 5). ElevenLabs writes one voiceover per scene and one music bed. Higgsfield sound is `generate_audio` on the clip, not a separate job.

- `render` (phase 6). Queued by `queue_video_render`. The worker reads the approved scenes, their current clip and voice, and the newest music bed from the database for the run's tenant; `run.input` only supplies the aspect. It builds one timeline (`src/compose/timeline.mjs`) and assembles an MP4 with ffmpeg (`src/compose/assemble.mjs`): every segment is normalised to stereo 48 kHz, music sits at 0.18 under the voice, and `overlay_text` is burned in as centred Hebrew titles (DejaVu Sans Bold, `OVERLAY_FONT` overrides). Each render is stored as `render/film-<run id>.mp4`.

### Video providers

Every provider implements `estimate / submit / poll` (`src/providers/`), so changing provider touches only that folder.

- `mock` (default): a free ffmpeg Ken Burns push-in on the still. Use it on Staging to exercise the full flow without spending.
- `kling`: the official Kling image-to-video API. It takes a JWT from `KLING_ACCESS_KEY` and `KLING_SECRET_KEY`, and `KLING_BASE_URL`, `KLING_MODEL` and `KLING_MODE` override the defaults. The request shape follows the published v1 `image2video` API; confirm it with one paid test clip before turning it on. Cost is estimated at about $0.85 (5,100 credits) per 5 s pro clip, and 10 s for scenes longer than 5 s.

No dependencies beyond Node 22 and ffmpeg.

## Staging queue

Until a Droplet is running, `.github/workflows/render-worker.yml` drains the **Staging** queue every 10 minutes and on `workflow_dispatch`. It resolves the Staging service role from `SUPABASE_STAGING_PROJECT_ID` and `BASE_ACCESS_TOKEN`, sets `DRAIN=1`, and exits when a claim finds nothing queued. `VIDEO_PROVIDER` defaults to `mock`. A run that already names `kling`, `elevenlabs` or `higgsfield` still uses that provider. Production is not a target of this workflow.

## Run on the Droplet

```bash
git clone … && cd aios/render-worker
cp .env.example .env   # fill in the Staging project URL and service-role key
docker build -t aios-render-worker .
docker run -d --name aios-render-worker --restart unless-stopped --env-file .env aios-render-worker
docker logs -f aios-render-worker
```

Give the Droplet at least 4 vCPUs. Films are assembled with ffmpeg; no Remotion licence is needed.

## Test

```bash
node --test test/*.test.mjs   # the ffmpeg test needs ffmpeg on PATH and skips otherwise
```

## Safety rules the worker enforces

- Tenant members can insert `marketing_runs`, so `run.input` is never trusted for files. Storage paths must start with the run's tenant id and cannot contain `.` or `..` segments (`src/guard.mjs`). The item and scene are re-read for the run's tenant, and the client folder comes from the item.
- Remote stills are fetched only over https from the Supabase project, `*.supabase.co` or `MEDIA_URL_HOSTS`.
- Paid jobs are charged at most once per run. Clips resume the stored provider job. Voice and music store the audio and record its path before attaching it, and a failure after the provider has charged is final, not retried. The database also allows only one queued or running job per scene (clip, voice) and per project (music, render).
- The tenant's own ElevenLabs and Higgsfield keys win; the worker's env keys are only a fallback.
