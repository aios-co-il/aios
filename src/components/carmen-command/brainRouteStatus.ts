export function statusLabel(status?: string | null): string | null {
  if (status === "waiting_external") return "ממתין לערוץ";
  if (status === "debating") return "פרלמנט פעיל";
  if (status === "streaming") return "זורם";
  if (status === "error") return "שגיאה";
  return null;
}
