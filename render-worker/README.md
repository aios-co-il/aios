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

- `voice` and `music` (phase 5). ElevenLabs writes one voiceover per scene and one music bed. Higgsfield sound is `generate_audio` on the clip, not a separate job. The music job sizes the bed to the film that will be rendered (`src/jobs/music-length.mjs`): the scenes fitted to the narration's word timings as the edit cuts them, plus the end card and a 4 s tail. While the narration is still being made it waits up to two minutes; without it the planned length gets 15% headroom. The request never passes what the run's quote (`input.estimate.usd`) pays for, and the run records the cost of the length it asked for. Without an ElevenLabs key it fails at once, before any wait. A bed already paid for keeps its length.

- `lipsync` (talking scenes). A scene with `meta.lipsync = true` is a character speaking its line (`meta.dialogue`, else `voiceover_text`; `meta.speaker` says who). On an engine that speaks (ElevenLabs Veo 3.1, Higgsfield Seedance 2.5) the `clip` job puts the line in the prompt with audio on and marks the clip `meta.lipsync`; `LIPSYNC_NATIVE=0` turns that off. Otherwise `advance_video_production` queues the scene's own voice line and then one `lipsync` run (`queue_video_lipsync`). The worker sends the still (ElevenLabs `creatify-aurora`, Higgsfield Seedance 2.5 reference-to-video) or the clip (Kling `/v1/videos/lip-sync`) with that voice, stores the provider job id before polling, saves `<scene>/lipsync-v<n>.mp4` and attaches it as the scene clip with `meta.lipsync`. The first provider the tenant has a key for is used (`LIPSYNC_PROVIDER` overrides); with none the run fails with a clear message. The film plays a talking clip's own audio, and a storyboard with a talking scene is narrated scene by scene.
- `render` (phase 6). Queued by `queue_video_render`. The worker reads the approved scenes, their current clip and voice, and the newest music bed from the database for the run's tenant; `run.input` only supplies the aspect. It builds one timeline (`src/compose/timeline.mjs`) and renders it with Remotion (`workers/creative-video/remotion`, composition `WorkshopFilm`): camera moves, overlapping transitions (crossfade, slide, wipe, zoom), word-by-word Hebrew captions from the ElevenLabs timings (Heebo), and a brand end card with logo and CTA. A mock clip is replaced by its still so the camera move is done in Remotion. A real provider clip (Kling, ElevenLabs, Higgsfield) is placed on the timeline and keeps its own audio when nobody speaks over it. Scenes stretch so speech is never cut. Before mixing, each sound effect's hit is levelled to -14 LUFS (`src/compose/sound-prep.mjs`). In both edits a track shorter than the film, or one whose music dies away before the film's closing fade, is looped from its top with a crossfade at its musical end (`src/compose/music-bed.mjs`). An ordinary film's bed keeps its own level: it sits at 0.2 and ducks to 0.06 under speech, and a film whose speech starts in its first frames opens with the bed already down. A film with sound design (`video.sound_design`) gets the trailer mix instead: its bed is levelled to -17 LUFS, comes up to about -21.5 LUFS when nobody speaks and sits 13.5 dB under the measured narration while she speaks; pauses under a second keep it down. Over karaoke captions each scene's short title (`overlay_text`, at most five words and 32 characters, not a repeat of its line) shows at the top; the ffmpeg edit keeps its bottom titles. Output is h264 CRF 18, yuv420p, AAC 192k. Set `REMOTION_DISABLE=1` to fall back to the ffmpeg concat. Each render is stored as `render/film-<run id>.mp4`.

### Video providers

Every provider implements `estimate / submit / poll` (`src/providers/`), so changing provider touches only that folder.

- `mock` (default): a free ffmpeg Ken Burns push-in on the still. Use it on Staging to exercise the full flow without spending.
- `kling`: the official Kling image-to-video API. It signs a JWT with the tenant's Kling Access Key and Secret Key (AI keys settings, `kling_access_key` / `kling_secret_key` in the `llm` integration), falling back to `KLING_ACCESS_KEY` and `KLING_SECRET_KEY`, and `KLING_BASE_URL`, `KLING_MODEL` and `KLING_MODE` override the defaults. The request shape follows the published v1 `image2video` API; confirm it with one paid test clip before turning it on. Cost is estimated at about $0.85 (5,100 credits) per 5 s pro clip, and 10 s for scenes longer than 5 s.
- `openrouter`: OpenRouter's video API (`POST /api/v1/videos`, poll, then download `/videos/{id}/content` with the key). The key is the tenant's first OpenRouter brain in Carmen settings, read from Vault with `carmen_brain_secret_get`; there is no env fallback. The model defaults to `kwaivgi/kling-v3.0-std` (`OPENROUTER_VIDEO_MODEL` overrides it), at about $0.084 per second, 3 to 15 s, with the approved still sent as the first frame. Lengths are clamped per model family (Veo 3.1 4/6/8 s, Seedance 2.5 4–30 s). A talking scene goes to `OPENROUTER_TALKING_MODEL` (`google/veo-3.1`) with `generate_audio` and the Hebrew line in the prompt, estimated at `OPENROUTER_TALKING_USD_PER_SECOND` (0.4).

**Fallback before submit.** When the chosen paid engine refuses a clip before any job id is saved (no credits, rejected key), the clip moves to `openrouter` when the tenant has an OpenRouter brain (the key is read from Vault only then) and the chosen engine is not OpenRouter, then to `mock`. An ElevenLabs plan that cannot make video tries Higgsfield first. The clip records `fallback_from`. Once a job id is saved the run only resumes that job.

No dependencies beyond Node 22 and ffmpeg.

## One container per environment

Each container serves one Supabase project: `WORKER_ENV`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Build it from that environment's branch (`develop` for Staging, `main` for Production) and give it only that environment's fallback keys. The worker refuses to start if suffixed pairs such as `SUPABASE_URL_PRODUCTION` are set, so code that has only run on Staging never claims Production jobs.

`.github/workflows/render-worker.yml` drains **Staging only** every 10 minutes. `.github/workflows/render-worker-preview.yml` drains a PR's own Supabase preview branch on every push, and on demand with "Run workflow" on that branch for jobs queued while testing. Neither calls Production. `VIDEO_PROVIDER` defaults to `mock` on Staging. A run that already names `kling`, `elevenlabs` or `higgsfield` still uses that provider.

## Run on the Droplet

Run from the repo root so the Remotion package is in the image. Repeat with another env file and container name for each environment.

```bash
git clone … && cd aios && git checkout develop
cp render-worker/.env.example render-worker/.env.staging   # Staging URL, key and fallback keys only
docker build -f render-worker/Dockerfile -t aios-render-worker:staging .
docker run -d --name aios-render-worker-staging --restart unless-stopped --env-file render-worker/.env.staging aios-render-worker:staging
docker logs -f aios-render-worker-staging
```

Give the Droplet at least 4 vCPUs.

## Test

```bash
pnpm --dir .. test:components   # from the repo root; the ffmpeg test needs ffmpeg on PATH and skips otherwise
```

## Safety rules the worker enforces

- Tenant members can insert `marketing_runs`, so `run.input` is never trusted for files. Storage paths must start with the run's tenant id and cannot contain `.` or `..` segments (`src/guard.mjs`). The item and scene are re-read for the run's tenant, and the client folder comes from the item.
- Remote stills are fetched only over https from the Supabase project, `*.supabase.co` or `MEDIA_URL_HOSTS`.
- Paid jobs are charged at most once per run. Clips resume the stored provider job. Voice and music store the audio and record its path before attaching it, and a failure after the provider has charged is final, not retried. The database also allows only one queued or running job per scene (clip, voice) and per project (music, render).
- The tenant's own ElevenLabs and Higgsfield keys win; the worker's env keys are only a fallback.
