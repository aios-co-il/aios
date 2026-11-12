import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { FeedRecording } from "./RecordingCard";
import { captureVideoFrame } from "./captureVideoFrame";
import {
  createSerialQueue,
  meetingFramePath,
  needsMeetingFrame,
} from "./meetingFrame";

const SIGNED_URL_SECONDS = 600;

/** Recordings already attempted this page session, so each is tried once. */
const attemptedRecordingIds = new Set<string>();
/** One capture at a time: each one streams part of a video. */
const enqueueCapture = createSerialQueue();

interface MeetingFrameJob {
  tenantId: string;
  recordingId: string;
  filePath: string;
  /** The recording and its grouped siblings, which share one card. */
  recordingIds: Array<string>;
}

/**
 * Captures a frame from a recording's video the first time its card is on
 * screen, stores it as the recording's thumbnail and refreshes the feed.
 * Returns a ref callback for the element whose visibility starts the capture.
 * Failures are logged only: a missing picture must not break the card.
 */
export function useMeetingFrame(
  rec: FeedRecording,
): (node: HTMLElement | null) => void {
  const { currentTenantId } = useTenant();
  const queryClient = useQueryClient();
  const [node, setNode] = useState<HTMLElement | null>(null);
  const { mutate } = useMutation({
    mutationFn: (job: MeetingFrameJob) =>
      enqueueCapture(() => storeMeetingFrame(job)),
    onSuccess: (thumbnailPath) => {
      queryClient.invalidateQueries({ queryKey: ["recordings"] });
      queryClient.invalidateQueries({
        queryKey: ["recording-thumb", thumbnailPath],
      });
    },
    onError: (error, job) =>
      console.error("[useMeetingFrame] capture failed", job.recordingId, error),
  });
  const eligible = needsMeetingFrame(rec);
  const groupIdsKey = (rec._group ?? [rec]).map((r) => r.id).join(",");
  const job = useMemo(
    () =>
      eligible
        ? buildJob(currentTenantId, rec.id, rec.file_path, groupIdsKey)
        : null,
    [eligible, currentTenantId, rec.id, rec.file_path, groupIdsKey],
  );

  useEffect(() => {
    if (!node || !job || attemptedRecordingIds.has(job.recordingId)) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || attemptedRecordingIds.has(job.recordingId)) {
        return;
      }
      observer.disconnect();
      attemptedRecordingIds.add(job.recordingId);
      mutate(job);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, job, mutate]);

  return setNode;
}

/** The capture job for an eligible card, or null without a tenant or file. */
function buildJob(
  tenantId: string | null,
  recordingId: string,
  filePath: string | null,
  groupIdsKey: string,
): MeetingFrameJob | null {
  if (!tenantId || !filePath) {
    return null;
  }
  return {
    tenantId,
    recordingId,
    filePath,
    recordingIds: groupIdsKey.split(","),
  };
}

/** Captures, uploads and links a frame; resolves with its Storage path. */
async function storeMeetingFrame(job: MeetingFrameJob): Promise<string> {
  const videoUrl = await getSignedVideoUrl(job.filePath);
  const frame = await captureVideoFrame(videoUrl);
  const thumbnailPath = meetingFramePath(job.tenantId, job.recordingId);
  await uploadFrame(thumbnailPath, frame);
  await linkThumbnail(job.tenantId, job.recordingIds, thumbnailPath);
  return thumbnailPath;
}

/** A short-lived signed URL for the private recording file. */
async function getSignedVideoUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("recordings")
    .createSignedUrl(filePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) {
    throw error ?? new Error(`No signed URL for ${filePath}`);
  }
  return data.signedUrl;
}

/**
 * Uploads the JPEG. The bucket has no UPDATE policy, so an upsert would be
 * refused; a frame left by an earlier attempt is reused as is instead.
 */
async function uploadFrame(path: string, frame: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from("recordings")
    .upload(path, frame, { contentType: "image/jpeg", upsert: false });
  if (error && !isAlreadyExists(error)) {
    throw error;
  }
}

/** Storage's "object already exists" refusal, returned as status 409. */
function isAlreadyExists(error: Error): boolean {
  return (
    ("statusCode" in error && error.statusCode === "409") ||
    /already exists/i.test(error.message)
  );
}

/** Points every recording the card represents at the captured frame. */
async function linkThumbnail(
  tenantId: string,
  recordingIds: Array<string>,
  thumbnailPath: string,
): Promise<void> {
  const { error } = await supabase
    .from("zoom_recordings")
    .update({ thumbnail_path: thumbnailPath })
    .eq("tenant_id", tenantId)
    .in("id", recordingIds);
  if (error) {
    throw error;
  }
}
