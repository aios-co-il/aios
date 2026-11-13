// Turn a finished Recall bot into a zoom_recordings row + summary/brief.
//
// Written to be idempotent and safe to re-run: the webhook calls it as soon as
// `bot.done` arrives, and meeting-bot-reconcile calls it again for sessions that
// never reached `done` (edge function killed mid-download, transcript artifact
// still processing when the meeting ended, etc.).
import {
  AWAITING_VIDEO,
  meetingBotMediaPath,
  RECORDINGS_BUCKET,
  startVideoStorage,
  withinVideoRetention,
} from "./meeting-bot/video-storage.ts";
import type { DbClient } from "./supabase-clients.ts";
import {
  extractRecallDownloads,
  recallTranscriptToText,
  retrieveRecallBot,
} from "./recall.ts";
import { runRecordingPipeline } from "./recording-pipeline.ts";
import { type MeetingPlatform, platformLabel } from "./meeting-url.ts";

// Whisper's own ceiling is 25MB; only hand it the small mixed-audio artifact.
const MAX_WHISPER_FALLBACK_BYTES = 24 * 1024 * 1024;
// Give up waiting for a transcript that never becomes available.
const TRANSCRIPT_WAIT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type FinalizeOutcome =
  "done" | "awaiting_transcript" | "awaiting_video" | "no_recording" | "failed";

export interface FinalizeResult {
  outcome: FinalizeOutcome;
  detail: string;
}

export interface MeetingBotSession {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  agency_id: string | null;
  campaigner_ids: string[] | null;
  summary_scope: "auto" | "client" | "lead" | "campaigner" | "agency";
  platform: string;
  meeting_topic: string | null;
  external_bot_id: string | null;
  zoom_recording_id: string | null;
  scheduled_start: string | null;
  joined_at: string | null;
  ended_at: string | null;
  created_by: string | null;
}

interface FetchedMedia {
  blob: Blob | null;
  tooLarge: boolean;
}

/** Download a media artifact unless it is too big to hold in memory. */
async function fetchMediaIfSmallEnough(
  url: string,
  maxBytes: number,
): Promise<FetchedMedia> {
  const res = await fetch(url);
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`media download failed (${res.status})`);
  }

  const declared = Number(res.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await res.body?.cancel();
    return { blob: null, tooLarge: true };
  }

  const blob = await res.blob();
  if (blob.size > maxBytes) return { blob: null, tooLarge: true };
  return { blob, tooLarge: false };
}

// deno-lint-ignore no-explicit-any
export async function finalizeMeetingBotSession(
  admin: any,
  session: MeetingBotSession,
): Promise<FinalizeResult> {
  const botId = session.external_bot_id;
  if (!botId)
    return { outcome: "failed", detail: "session has no external_bot_id" };

  const botData = await retrieveRecallBot(botId);
  const {
    videoUrl,
    audioUrl,
    transcriptUrl,
    transcriptStatus,
    durationSeconds,
  } = extractRecallDownloads(botData);

  const endedAt = session.ended_at
    ? new Date(session.ended_at).getTime()
    : Date.now();
  const waitedTooLong = Date.now() - endedAt > TRANSCRIPT_WAIT_TIMEOUT_MS;

  if (!videoUrl && !audioUrl && !transcriptUrl) {
    // Either the recording is still being assembled, or the bot never captured
    // anything (kicked before recording, permission denied…). Only the second
    // case is terminal, and waiting is how we tell them apart.
    if (!waitedTooLong) {
      await admin
        .from("meeting_bot_sessions")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return {
        outcome: "awaiting_transcript",
        detail: "no media available yet",
      };
    }
    // status_detail already carries Recall's sub_code, so leave it in place.
    await admin
      .from("meeting_bot_sessions")
      .update({
        status: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    return { outcome: "no_recording", detail: "bot produced no media" };
  }

  let transcription: string | null = null;
  if (transcriptUrl) {
    try {
      const trRes = await fetch(transcriptUrl);
      if (trRes.ok) {
        const parsed = recallTranscriptToText(await trRes.json());
        transcription = parsed.trim() ? parsed : null;
      } else {
        console.error(
          "[meeting-bot-finalize] transcript fetch failed",
          trRes.status,
        );
      }
    } catch (trErr) {
      console.error("[meeting-bot-finalize] transcript download error", trErr);
    }
  }

  // Reuse the row from an earlier attempt so retries never duplicate recordings.
  let recordingId = session.zoom_recording_id;
  if (!recordingId) {
    const { data: existing } = await admin
      .from("zoom_recordings")
      .select("id")
      .eq("tenant_id", session.tenant_id)
      .eq("meeting_id", botId)
      .maybeSingle();
    recordingId = existing?.id ?? null;
  }

  const durationMin = durationSeconds
    ? Math.max(1, Math.round(durationSeconds / 60))
    : null;
  const defaultTopic = `${platformLabel(session.platform as MeetingPlatform)} — כרמן`;
  const topic = session.meeting_topic || defaultTopic;

  const row: Record<string, unknown> = {
    tenant_id: session.tenant_id,
    client_id: session.client_id,
    lead_id: session.lead_id,
    agency_id: session.agency_id,
    campaigner_ids: session.campaigner_ids,
    summary_scope: session.summary_scope,
    meeting_id: botId,
    meeting_topic: topic,
    // A name someone gave the bot (dialog or Carmen) is kept over the summary's (AIO-563).
    topic_set_manually: topic !== defaultTopic,
    start_time:
      session.joined_at || session.scheduled_start || new Date().toISOString(),
    duration: durationMin,
    source: "meeting_bot",
    recording_url: videoUrl,
  };
  if (transcription) {
    row.transcription = transcription;
    row.transcription_status = "completed";
  }

  let recording;
  if (recordingId) {
    const { data, error } = await admin
      .from("zoom_recordings")
      .update(row)
      .eq("id", recordingId)
      .select(
        "id, tenant_id, meeting_id, source, client_id, lead_id, agency_id, campaigner_ids, summary_scope, meeting_topic, start_time, duration, host_email, transcription, calendar_event_id",
      )
      .single();
    if (error)
      throw new Error(`update zoom_recordings failed: ${error.message}`);
    recording = data;
  } else {
    if (!transcription) row.transcription_status = "pending";
    const { data, error } = await admin
      .from("zoom_recordings")
      .insert(row)
      .select(
        "id, tenant_id, meeting_id, source, client_id, lead_id, agency_id, campaigner_ids, summary_scope, meeting_topic, start_time, duration, host_email, transcription, calendar_event_id",
      )
      .single();
    if (error)
      throw new Error(`insert zoom_recordings failed: ${error.message}`);
    recording = data;
    recordingId = data.id;
  }

  await admin
    .from("meeting_bot_sessions")
    .update({
      zoom_recording_id: recordingId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  // No transcript yet. Recall's own artifact is still the best source, so wait
  // for a later retry rather than burning a Whisper pass on partial media.
  if (!transcription) {
    if (!waitedTooLong && transcriptStatus !== "failed") {
      await admin
        .from("meeting_bot_sessions")
        .update({
          status: "processing",
          status_detail: `awaiting_transcript${transcriptStatus ? `:${transcriptStatus}` : ""}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return {
        outcome: "awaiting_transcript",
        detail: `transcript status: ${transcriptStatus}`,
      };
    }

    // Fall back to Whisper on the small mixed-audio artifact when Recall's
    // transcription failed outright or is never going to arrive.
    let fallbackDone = false;
    if (audioUrl) {
      try {
        const { blob } = await fetchMediaIfSmallEnough(
          audioUrl,
          MAX_WHISPER_FALLBACK_BYTES,
        );
        if (blob) {
          const audioPath = meetingBotMediaPath(session, "mp3");
          const { error: upErr } = await admin.storage
            .from(RECORDINGS_BUCKET)
            .upload(audioPath, blob, {
              contentType: "audio/mpeg",
              upsert: true,
            });
          if (!upErr) {
            await admin
              .from("zoom_recordings")
              .update({ audio_file_path: audioPath })
              .eq("id", recordingId);
            fallbackDone = true;
          }
        }
      } catch (audErr) {
        console.error("[meeting-bot-finalize] audio fallback failed", audErr);
      }
    }

    if (!fallbackDone) {
      const waiting = await waitForStoredVideo(
        admin,
        session,
        recording.id,
        !!videoUrl,
      );
      if (waiting) {
        return waiting;
      }
    }
  }

  await runRecordingPipeline(admin, {
    recording,
    createdByUserId: session.created_by,
    briefSource: "meeting_bot",
    skipTranscribe: !!transcription,
  });

  if (videoUrl) {
    await startVideoStorage(admin, session);
  }

  await admin
    .from("meeting_bot_sessions")
    .update({
      status: "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  return {
    outcome: "done",
    detail: transcription
      ? `transcript ${transcription.length} chars`
      : "transcribed via fallback",
  };
}

/**
 * With no Recall transcript and no usable audio, the stored video is the last
 * source transcribe-recording can read (it uses file_path). Null when the video
 * is stored and the pipeline can run. Otherwise starts the copy and parks the
 * session as done/awaiting_video, or marks it failed when there is no video or
 * Recall's media is past the retention window.
 */
async function waitForStoredVideo(
  admin: DbClient,
  session: MeetingBotSession,
  recordingId: string,
  hasVideo: boolean,
): Promise<FinalizeResult | null> {
  const { data, error } = await admin
    .from("zoom_recordings")
    .select("file_path")
    .eq("tenant_id", session.tenant_id)
    .eq("id", recordingId)
    .maybeSingle();
  if (error) {
    throw new Error(`load file_path failed: ${error.message}`);
  }
  if (data?.file_path) {
    return null;
  }

  if (hasVideo && withinVideoRetention(session.ended_at, Date.now())) {
    // `done`, not `processing`: the reconcile sweep would re-run finalize every
    // minute while the copy runs. Reconcile's video retry re-copies it instead.
    await admin
      .from("meeting_bot_sessions")
      .update({
        status: "done",
        status_detail: AWAITING_VIDEO,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);
    await startVideoStorage(admin, session);
    return {
      outcome: "awaiting_video",
      detail: "transcribes from the stored video once it is copied",
    };
  }

  await admin
    .from("meeting_bot_sessions")
    .update({
      status: "failed",
      error: "no transcript from Recall and no audio available for fallback",
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);
  return { outcome: "failed", detail: "no transcript and no usable audio" };
}
