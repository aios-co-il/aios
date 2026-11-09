/** DB enum task_status is open|in_progress|done. Carmen tools historically used `completed`. */
export function mapHumanTaskStatus(
  status: string,
): "open" | "in_progress" | "done" {
  const value = (status || "").trim().toLowerCase();
  if (value === "completed" || value === "done") {
    return "done";
  }
  if (value === "in_progress") {
    return "in_progress";
  }
  if (value === "open") {
    return "open";
  }
  throw new Error(`סטטוס משימה לא תקין: ${status}`);
}
