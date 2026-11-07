import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CREATIVE_VIDEO_BUCKET,
  guideRecordingPath,
} from "@functions/_shared/workshop/narration-guide.ts";
import { recordingFile } from "./recording";
import type { NarrationRecording } from "./useNarrationRecorder";

export interface GuideTarget {
  tenantId: string;
  clientId: string | null;
  itemId: string;
}

/**
 * Uploads the user's recording to the project's narration folder in the private creative-video
 * bucket (its insert policy allows a member's own tenant folder) and resolves its path, which the
 * chat line carries to Carmen.
 */
export function useSendGuideRecording(target: GuideTarget) {
  return useMutation({
    mutationFn: async (recording: NarrationRecording) => {
      const file = recordingFile(recording.mimeType);
      const path = guideRecordingPath({ ...target, extension: file.extension });
      const { error } = await supabase.storage
        .from(CREATIVE_VIDEO_BUCKET)
        .upload(path, recording.blob, { contentType: file.contentType });
      if (error) {
        console.error("[workshop] narration recording not uploaded", error);
        throw error;
      }
      return path;
    },
  });
}
