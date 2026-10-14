# Carmen Video Studio

Goal: Carmen produces a complete promo video inside AIOS (storyboard → stills → clips → voice and music → rendered MP4), tied to a client. Work ships in seven phases; each ends with a PR to `develop`, a Staging check and David's approval before the next one starts.

| Phase | Scope                                                                                          | Status  |
| ----- | ---------------------------------------------------------------------------------------------- | ------- |
| 1     | Data foundation: `marketing_video_scenes`, run tracking columns, buckets, RLS, storyboard move | This PR |
| 2     | Storyboard strip editor, versions, prompt edits, approvals, Nano Banana Pro                    | This PR |
| 3     | Reference video analysis (worker)                                                              | This PR |
| 4     | Animation: provider adapter, Kling image-to-video, queue, budget approval                      | This PR |
| 5     | Scene engine choice (free preview, Kling, ElevenLabs, Higgsfield) and ElevenLabs sound         | This PR |
| 6     | Composition and render: shared timeline, ffmpeg assembly with Hebrew titles                    | This PR |
| 7     | Carmen tools and the "במאית וידאו" skin                                                        | This PR |

## Phase 1 data model

Migration: `supabase/migrations/20261014070000_video_studio_foundation.sql` (idempotent, additive, no DROP/DELETE/REVOKE). Applied to AIOS Staging on 2026-10-13; Production waits for `מאשר לפרודקשן`.

- **`marketing_video_scenes`** — one row per storyboard scene. `position` is numeric so a drag can take the midpoint. `still_asset_id`, `clip_asset_id`, `voice_asset_id` point at the current version in `marketing_assets`; `focal_x` (0–100) is the horizontal focus used for 1:1 and 9:16 crops. RLS: tenant members (and super admins) by `tenant_id`; a trigger rejects a scene whose `item_id` belongs to another tenant.
- **Status** (`marketing_video_scene_status`): `draft → still_generating → still_ready → still_approved → clip_generating → clip_ready → clip_approved`, plus `failed`. The guard trigger returns a scene to `draft` when `visual_prompt` changes without a new still, and sets `clip_stale` when the still or prompt changes after a clip exists (only that scene is re-animated).
- **`marketing_runs`** gains `kind` (`still|clip|voice|music|render|reference_analysis`), `scene_id`, `provider`, `provider_job_id` (unique per provider), `credits`, `attempts`.
- **`marketing_assets`** types: `video_still`, `video_clip`, `voiceover` today (`music`, `render`, `reference_video` follow). `meta` holds `scene_id`, `version`, `approved`, `generation_cost`.
- **Functions**
  - `save_video_storyboard(item_id, scenes jsonb)` — upserts text fields, order and canvas position only; never touches status or asset links. The editor deletes scenes it loaded and the user removed with a normal RLS-scoped delete, so scenes added elsewhere survive a save.
  - `attach_video_scene_asset(scene_id, kind, url, meta, run_id)` — inserts the next version (`still|clip|voice`) and links it to the scene in one transaction.
  - `migrate_storyboard_to_video_scenes(item_id default null)` — the one-time move from `payload.storyboard`; skips items that already have scenes, so it can be re-run after the Staging mirror brings in a storyboard created on Production before release. `payload.storyboard` stays as a frozen backup and nothing reads it for video projects.
- **Buckets**: private `creative-video` (200 MB per file, video/audio/image/json/vtt; path `tenant_id/client_id/item_id/scene_id/<kind>-v<n>.<ext>`, signed URLs only, tenant-folder RLS). `carmen-media` created on Staging, where `carmen-save-media` expected it.
- **Realtime**: `marketing_video_scenes` is in `supabase_realtime` for live scene status from phase 4 on.

**Release order (Production):** apply the migration and deploy `main` (frontend + `marketing-creative-plan`) in the same window, then run `select public.migrate_storyboard_to_video_scenes();` once more. Until the new frontend is live, the old one keeps writing only `payload.storyboard`; an item that already has scenes is not re-moved, so edits made in that window would not show in the new editor. The same applies on Staging to storyboards the mirror brings in from Production after the move.

The Staging mirror only adds or updates rows from Production and its preflight only fails on columns missing on Staging, so the new columns and table do not block it.

## Phase 2 storyboard editor

- The React Flow canvas became an RTL frame strip: drag to reorder (`@dnd-kit`), `+` between frames to insert, and a status badge, duration and lock on each card. "Generate all" skips locked frames.
- The scene sheet gained "ערוך בהנחיה" (a prompt edit of the current still), a version strip (choosing a version makes it the scene's current still), and "אשר פריים" (`still_approved`).
- Fixed character: one uploaded picture (`payload.video.character_ref_url`) goes first in the references of every scene where "הדמות מופיעה בסצנה" is on (`meta.has_character`), with a `character` reference role.
- Still model per project (`payload.video.still_model`): `gpt-image-1` or Nano Banana Pro (`gemini-3-pro-image`, falls back to `-preview`) through `ai-generate-social-image`. It uses the tenant's Google key from the LLM integration (or `GEMINI_API_KEY`), and the cost is estimated at $0.134 per image.
- Video still prompts drop studio names (Pixar, Disney, DreamWorks…) and always end with "No text, no letters, no logos."
- Migration `20261014090000_video_studio_storyboard_flags.sql`: `save_video_storyboard` also stores `locked` and `meta.has_character`.
- Edge functions reach Staging only after merge to `develop` (the Staging deployer adds the outbound guard), so Nano Banana Pro works on Staging after that merge; the Preview still renders with gpt-image-1.

## Phase 3 reference video

- The "סרטון רפרנס" button in the storyboard toolbar uploads a video (up to 200 MB) to `creative-video/<tenant>/<client>/<item>/reference/`. It records a `reference_video` asset and queues a `marketing_runs` row with `kind = 'reference_analysis'`. The screen polls the run every 4 s while it is queued or running.
- `render-worker/` is a dependency-free Node 22 + ffmpeg service for the DigitalOcean Droplet; see its README for the steps. It claims runs with `claim_video_run` (service role only, `FOR UPDATE SKIP LOCKED`) and processes them as follows:
  1. finds shots with ffmpeg scene cuts and saves a keyframe per shot;
  2. transcribes with ElevenLabs Scribe (Whisper as fallback);
  3. describes the shots in one vision call;
  4. writes `output.proposal.frames`: one frame per reference shot, with the same durations and camera language, original content for the client's brief, and no copied characters, brands, text or studio names.
- "הצעת סטוריבורד" shows the keyframes next to the proposed scenes. "החלף את הסטוריבורד בהצעה" replaces the storyboard, including `motion_prompt`, which `save_video_storyboard` now stores.
- Migration `20261014110000_video_studio_run_claim.sql` is applied on Staging.
- **The worker is not deployed yet:** runs stay queued until it runs on the Droplet against Staging.

## Phase 4 animation

- The scene sheet gained "מה זז בסצנה?" (`motion_prompt`), plus "הנפש סצנה" / "הנפש מחדש" and "אשר קליפ" (`clip_approved`). "הנפש הכול" in the toolbar takes approved stills without a clip, failed scenes, and scenes whose clip is outdated (`clip_stale`). Current clips are not animated again.
- Before anything is queued, a dialog shows the seconds, the estimated cost and the Kling credits ($0.85 per 5 s block; scenes over 5 s are 10 s clips). Confirming saves the storyboard, so typed motion prompts are included, then calls `queue_video_clips`.
- Migration `20261014130000_video_studio_clip_queue.sql` is applied on Staging. `queue_video_clips(item, scene_ids, aspect, estimate, stage)` queues one `kind = 'clip'` run per scene that has a still and no clip run in flight, then sets those scenes to `clip_generating`. A double click or a second tab cannot queue the same scene twice.
- The worker runs clips in parallel (`CONCURRENCY`, 8 by default) through the provider adapter (`mock` or `kling`; see `render-worker/README.md`). Each run fails on its own; after its last attempt the scene shows `failed` and "הנפש הכול" picks it up again.
- The strip follows `marketing_video_scenes` over Realtime. A live update replaces an untouched draft. A draft with unsaved edits keeps them and only takes the status and clip fields. Cards play their clip on hover, and the sheet has a player; clips use signed URLs from the private bucket.
- **Before turning on `VIDEO_PROVIDER=kling`:** confirm the request shape with one paid clip (the Kling docs could not be reached from here). Until then Staging uses the free `mock` provider.

## Phase 5 engines and sound

- Each video project stores `payload.video.scene_engine` and `payload.video.sound_engine`. The scene engine defaults to `mock`, the free preview, so opening an old project does not spend money.
- Scene engines: free preview, Kling, ElevenLabs (`veo-3.1-fast-generate-001` through `POST /v1/flows/video`, the approved still as the first frame), and Higgsfield PixVerse V6 (`POST /pixverse/v6/image-to-video`). The budget dialog uses that engine's estimate.
- Sound: ElevenLabs writes a voiceover per scene (`eleven_v4`, with word timestamps) and one music bed (`music_v2_5`). Higgsfield has no separate voice or music API; choosing it makes the clip itself carry generated audio.
- Keys live in the tenant LLM integration: `elevenlabs_api_key`, `higgsfield_api_key_id`, `higgsfield_api_key_secret`. Environment variables on the worker override them.
- Migration `20261014160000_video_studio_engines.sql` records the chosen engine on each clip run and adds `queue_video_sound`. Apply it on Staging before trying the new buttons. Production waits for `מאשר לפרודקשן`.
- The worker must be running. Until then voice, music and paid clips stay queued. The rates in the dialog are planning estimates until the first paid run.

## Phase 6 film assembly

- "הרכב סרט" is enabled when at least one scene is `clip_approved`. The confirm dialog says the assembly is local and costs $0.
- Migration `20261014170000_video_studio_render.sql` adds `queue_video_render`. It stores the approved clips (and their voice paths) plus the latest `music` asset on the run, so the worker does not trust a path sent from the browser. A render already queued or running is left as-is. Apply it on Staging before using the button. Production waits for `מאשר לפרודקשן`.
- The same migration drops the original `marketing_assets.type` check (`copy`, `image`, `video`, `brief`, `data`). The app already stores stills, clips, voice, music, renders, reference videos, storyboards and SEO plans, and existing rows are left in place.
- `render-worker` claims `kind = 'render'` and assembles an MP4 with ffmpeg from `buildTimeline`. The file is `creative-video/<tenant>/<client>/<item>/render/film-v<n>.mp4`, saved as a `render` asset with `meta.provider = compose`. The screen polls the run every 4 s and plays the signed MP4.
- The film is assembled with ffmpeg only: clips fitted to the frame, `overlay_text` burned in as centred Hebrew titles (ffmpeg's fribidi orders the text), voice per scene and music at 0.18. No Remotion render runs, so no Remotion licence is needed for now.

## Phase 7 video director

- Carmen tools `get_video_storyboard` and `render_video_film` live in `supabase/functions/_shared/video-director-tools.ts` and are registered on `run-ai-agent` without rewriting it.
- Migration `20261014180000_video_director_skin.sql` seeds the global skin `video_director` ("במאית וידאו"). She can read a storyboard and queue a compose render. She does not start a paid scene or sound engine, does not publish, and does not mix WhatsApp connections. Copy and creative skins can hand off to her.
- Edge functions reach Staging only after merge to `develop`. This branch is for Claude's review before publish.

## Provider checks (before writing provider code)

Checked against current public docs on 2026-10-13; outbound access to the vendor docs sites is blocked from the agent container, so these come from search results and should be confirmed with a live API call when the phase starts.

1. **ElevenLabs image/video API** — ElevenLabs ships an async Image & Video API (Flows, `POST /v1/flows/video`, pending/generating/completed/failed with webhooks; SDK v2.64.0). Kling 3.0 is listed in the Image & Video app, but the docs mark which models are API-callable and whether Kling 3.0 has an API `model_id` was **not confirmed**. Phase 4 starts with a probe of the API model list; if Kling is app-only, the adapter targets the official Kling API. The adapter interface (`submit / poll / estimate`) keeps this swappable.
2. **Model IDs** — TTS: `eleven_v4` (faster sibling `eleven_v4_turbo`). Music v2.5: `music_v2_5`.
3. **Remotion licence** — free for one person and for a company of up to 3 people, including commercial and automated use. A company of 4 or more pays for Automators: $0.01 per render, $100 per month minimum. A single operator can use Remotion without buying a licence. Phase 6 assembles the MP4 with ffmpeg, so no licence is needed until a Remotion render is added.

Sources: [ElevenLabs Image & Video](https://elevenlabs.io/docs/overview/capabilities/image-video), [ElevenLabs Create Video Generation](https://elevenlabs.io/docs/api-reference/flows/video/create), [Kling 3.0 with ElevenLabs](https://elevenlabs.io/video/kling-30), [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [Eleven v4](https://elevenlabs.io/v4), [Remotion pricing](https://www.remotion.dev/docs/license/pricing), [Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).

## Hardening after the engines merge

- **Tenant isolation:** the worker re-reads items, scenes and assets for the run's tenant and refuses storage paths outside the tenant folder. The Carmen tools load the project inside the caller's tenant, check client access (`assertCallerCanAccessClient`) and use the project's own stage.
- **No double charges:** partial unique indexes `marketing_runs_one_active_scene_job` and `marketing_runs_one_active_item_job`, and every queue function inserts with `ON CONFLICT DO NOTHING`. Voice and music are paid at most once per run, and unchanged voiceovers (same text as the current voice asset) are not queued again.
- **Sound:** segments are normalised to stereo 48 kHz before concat, and the music mix no longer halves the voice (`normalize=0`).
- **Staging:** the old 5-argument `queue_video_clips` was renamed to `queue_video_clips_superseded_5arg` instead of dropped, so applying it needed no confirmation. On Production the migration's `drop function if exists` removes it.
