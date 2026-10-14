# Carmen Video Studio

Goal: Carmen produces a complete promo video inside AIOS (storyboard → stills → clips → voice and music → rendered MP4), tied to a client. Work ships in seven phases; each ends with a PR to `develop`, a Staging check and David's approval before the next one starts.

| Phase | Scope                                                                                          | Status      |
| ----- | ---------------------------------------------------------------------------------------------- | ----------- |
| 1     | Data foundation: `marketing_video_scenes`, run tracking columns, buckets, RLS, storyboard move | **This PR** |
| 2     | Storyboard strip editor, versions, prompt edits, approvals, Nano Banana Pro                    | Not started |
| 3     | Reference video analysis (worker)                                                              | Not started |
| 4     | Animation: provider adapter, Kling image-to-video, queue, budget approval                      | Not started |
| 5     | Sound: per-scene voiceover with word timestamps, music                                         | Not started |
| 6     | Composition and render: `packages/video-templates`, Remotion player + worker                   | Not started |
| 7     | Carmen tools and the "במאית וידאו" skin                                                        | Not started |

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

## Provider checks (before writing provider code)

Checked against current public docs on 2026-10-13; outbound access to the vendor docs sites is blocked from the agent container, so these come from search results and should be confirmed with a live API call when the phase starts.

1. **ElevenLabs image/video API** — ElevenLabs ships an async Image & Video API (Flows, `POST /v1/flows/video`, pending/generating/completed/failed with webhooks; SDK v2.64.0). Kling 3.0 is listed in the Image & Video app, but the docs mark which models are API-callable and whether Kling 3.0 has an API `model_id` was **not confirmed**. Phase 4 starts with a probe of the API model list; if Kling is app-only, the adapter targets the official Kling API. The adapter interface (`submit / poll / estimate`) keeps this swappable.
2. **Model IDs** — TTS: `eleven_v4` (faster sibling `eleven_v4_turbo`). Music v2.5: `music_v2_5`.
3. **Remotion licence** — free for individuals and companies with up to 3 employees; 4+ need a company licence (Creators $25/seat/month, or Automators $0.01 per render with a $100/month minimum; Enterprise from $500/month). The licence text says terms change slightly in Remotion 5.0. AIOS needs a company licence before phase 6 renders.

Sources: [ElevenLabs Image & Video](https://elevenlabs.io/docs/overview/capabilities/image-video), [ElevenLabs Create Video Generation](https://elevenlabs.io/docs/api-reference/flows/video/create), [Kling 3.0 with ElevenLabs](https://elevenlabs.io/video/kling-30), [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [Eleven v4](https://elevenlabs.io/v4), [Remotion pricing](https://www.remotion.dev/docs/license/pricing), [Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
