import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import CustomAudioPlayer from "@/components/chat/CustomAudioPlayer";
import { CALL_RECORDINGS_BUCKET } from "@/lib/leadRecordings";

const SIGNED_URL_TTL_SECONDS = 3600;

interface Props {
  url: string | null;
  path: string | null;
}

/** Plays a call recording: a PBX link as-is, an uploaded file via a signed URL. */
export function CallRecordingPlayer({ url, path }: Props) {
  const { data: signedUrl } = useQuery({
    queryKey: ["call-recording-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(CALL_RECORDINGS_BUCKET)
        .createSignedUrl(path!, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !url && !!path,
    // Refresh before the signed URL expires.
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
  });
  const src = url || signedUrl;
  return src ? <CustomAudioPlayer src={src} className="mt-2" /> : null;
}
