# AIOS render worker

Long-running Node service for Video Studio jobs that cannot run in Supabase Edge Functions (ffmpeg, and Remotion in phase 6). It claims queued `marketing_runs` rows by `kind` with `claim_video_run` (service role only, `FOR UPDATE SKIP LOCKED`), processes one at a time, and writes `output`, `cost_usd` and status back. Failed runs are re-queued up to `MAX_ATTEMPTS` (3).

Handled kinds:

- `reference_analysis` (phase 3). Input is `{ bucket, path, asset_id }` of an uploaded reference video in `creative-video`, up to 180 s. The worker:
  1. finds shots with ffmpeg scene cuts (cuts under 0.6 s are dropped, and more than 24 shots are merged down);
  2. saves a keyframe per shot to `<path dir>/frames/`;
  3. transcribes word by word with ElevenLabs Scribe, or Whisper when no ElevenLabs key is set;
  4. describes every shot in a single vision call;
  5. writes `output.proposal.frames`: one frame per reference shot with the same durations. The proposal copies pace, rhythm and camera language only, never characters, brands, logos, text or dialogue.

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
