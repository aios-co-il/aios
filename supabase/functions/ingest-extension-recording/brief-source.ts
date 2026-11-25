/**
 * The marketing-brief source label for a recording: manual uploads are labelled
 * apart from Chrome-extension recordings, which share this ingest function.
 */
export function briefSourceFor(recordingSource: string | null): string {
  return recordingSource === "manual" ? "manual_upload" : "chrome_extension";
}
