import { useQuery } from "@tanstack/react-query";
import {
  openableRecordingUrl,
  publicRecordingPath,
} from "@/lib/recordingFileUrl";

/**
 * The link to show for a stored recordings file URL: a legacy public URL is
 * signed first (AIO-595), so the link is undefined until that resolves.
 */
export function useOpenableRecordingUrl(
  url: string | null | undefined,
): string | undefined {
  const needsSigning = !!url && publicRecordingPath(url) !== null;
  const { data } = useQuery({
    queryKey: ["openable-recording-url", url],
    queryFn: () => openableRecordingUrl(url as string),
    enabled: needsSigning,
    staleTime: 30 * 60 * 1000,
  });
  if (!url) {
    return undefined;
  }
  return needsSigning ? data : url;
}
