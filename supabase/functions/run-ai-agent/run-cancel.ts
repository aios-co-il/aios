/** What Carmen says when the user stopped her: what she already did, if anything. */
export function stoppedReply(toolsRun: Array<string>): string {
  const done = [...new Set(toolsRun)];
  return done.length > 0
    ? `⏹️ עצרתי לפי בקשתך. לפני העצירה כבר הרצתי: ${done.join(", ")}.`
    : "⏹️ עצרתי לפי בקשתך. לא בוצעה שום פעולה.";
}
