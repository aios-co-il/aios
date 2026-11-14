// Turn a finished Recall bot into a zoom_recordings row + summary/brief.
//
// Written to be idempotent and safe to re-run: the webhook calls it as soon as
// `bot.done` arrives, and meeting-bot-reconcile calls it again for sessions that
// never reached `done` (edge function killed mid-download, transcript artifact
// still processing when the meeting ended, etc.).
import {
  extractRecallDownloads,
  recallTranscriptToText,
  retrieveRecallBot,
} from "./recall.ts";
import { runRecordingPipeline } from "./recording-pipeline.ts";
import { defaultBotTopic, type MeetingPlatform } from "./meeting-url.ts";
import {
  alreadySummarized,
  findExistingRecording,
  finishAlreadySummarized,
  hasSummaryNow,
  type MeetingBotRecordingFields,
  recordingRowFor,
  type RecordingName,
} from "./meeting-bot/existing-recording.ts";

// A long meeting's mp4 does not fit in an edge function's memory. Above this we
// keep Recall's download URL on the row instead of copying the file to Storage.
const MAX_STORAGE_UPLOAD_BYTES = 80 * 1024 * 1024;
// Whisper's own ceiling is 25MB; only hand it the small mixed-audio artifact.
const MAX_WHISPER_FALLBACK_BYTES = 24 * 1024 * 1024;
// Give up waiting for a transcript that never becomes available.
const TRANSCRIPT_WAIT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export type FinalizeOutcome =
  "done" | "awaiting_transcript" | "no_recording" | "failed";

export interface MeetingBotSession {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  agency_id: string | null;
  campaigner_ids: string[] | null;
  // Text in the schema; the values are auto, client, lead, campaigner, agency.
  summary_scope: string;
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
): Promise<{ outcome: FinalizeOutcome; detail: string }> {
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
          // Not `ingesting`: that would hold off the webhook and the cron.
          status_detail: "awaiting_media",
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
  const existing = await findExistingRecording(admin, session, botId);
  let recordingId = existing?.id ?? null;

  let filePath: string | null = null;
  if (videoUrl) {
    try {
      const { blob, tooLarge } = await fetchMediaIfSmallEnough(
        videoUrl,
        MAX_STORAGE_UPLOAD_BYTES,
      );
      if (blob) {
        const path = `${session.tenant_id}/meeting_bot/${session.id}.mp4`;
        const { error: upErr } = await admin.storage
          .from("recordings")
          .upload(path, blob, {
            contentType: "video/mp4",
            upsert: true,
          });
        if (upErr)
          console.error("[meeting-bot-finalize] video upload failed", upErr);
        else filePath = path;
      } else if (tooLarge) {
        console.log(
          "[meeting-bot-finalize] video too large for Storage — keeping Recall URL",
        );
      }
    } catch (vidErr) {
      console.error("[meeting-bot-finalize] video download error", vidErr);
    }
  }

  const durationMin = durationSeconds
    ? Math.max(1, Math.round(durationSeconds / 60))
    : null;
  const defaultTopic = defaultBotTopic(session.platform as MeetingPlatform);
  const topic = session.meeting_topic || defaultTopic;

  const name: RecordingName = {
    meeting_topic: topic,
    // A name someone gave the bot (dialog or Carmen) is kept over the summary's (AIO-563).
    topic_set_manually: topic !== defaultTopic,
  };
  const fields: MeetingBotRecordingFields = {
    tenant_id: session.tenant_id,
    client_id: session.client_id,
    lead_id: session.lead_id,
    agency_id: session.agency_id,
    campaigner_ids: session.campaigner_ids,
    summary_scope: session.summary_scope,
    meeting_id: botId,
    start_time:
      session.joined_at || session.scheduled_start || new Date().toISOString(),
    duration: durationMin,
    source: "meeting_bot",
    recording_url: videoUrl,
  };
  if (filePath) {
    fields.file_path = filePath;
  }
  if (transcription) {
    fields.transcription = transcription;
    fields.transcription_status = "completed";
  }
  const row = recordingRowFor(fields, name, existing);

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

  // The webhook and the reconcile cron can both finalize a session; a second
  // run must not summarize again or undo the first run's name (AIO-587).
  if (alreadySummarized(existing)) {
    return await finishAlreadySummarized(admin, session);
  }

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
          const audioPath = `${session.tenant_id}/meeting_bot/${session.id}.mp3`;
          const { error: upErr } = await admin.storage
            .from("recordings")
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

    if (!fallbackDone && !filePath) {
      await admin
        .from("meeting_bot_sessions")
        .update({
          status: "failed",
          error:
            "no transcript from Recall and no audio available for fallback",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      return { outcome: "failed", detail: "no transcript and no usable audio" };
    }
  }

  // A run that started before ours may have summarized while we downloaded.
  if (await hasSummaryNow(admin, session.tenant_id, recording.id)) {
    return await finishAlreadySummarized(admin, session);
  }

  await runRecordingPipeline(admin, {
    recording,
    createdByUserId: session.created_by,
    briefSource: "meeting_bot",
    skipTranscribe: !!transcription,
  });

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
