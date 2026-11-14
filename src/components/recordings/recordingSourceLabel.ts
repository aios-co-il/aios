/**
 * The label for where a recording came from. A meeting-bot recording shows the org's name for
 * its assistant (`useCarmenIdentity().orgName`, AIO-592), since colleagues may have sent the bot.
 */
export function recordingSourceLabel(
  source: string | null,
  orgAssistantName: string,
): string {
  switch (source) {
    case "zoom":
      return "Zoom";
    case "manual":
      return "העלאה ידנית";
    case "chrome_extension":
      return "הקלטת מסך";
    case "google_meet":
      return "Google Meet";
    case "meeting_bot":
      return orgAssistantName;
    case "microsoft_teams":
    case "teams":
      return "Teams";
    default:
      return source || "Zoom";
  }
}
