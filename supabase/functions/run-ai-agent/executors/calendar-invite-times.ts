/** Keep Israel wall-clock event times naive; Google applies the explicit timeZone. */
export function calendarInviteTimes({
  date,
  time,
  duration_minutes,
}: {
  date: string;
  time: string;
  duration_minutes?: number;
}) {
  const startNaive = `${date}T${time}:00`;
  const endNaive = new Date(
    Date.parse(`${startNaive}Z`) + (duration_minutes || 60) * 60_000,
  )
    .toISOString()
    .slice(0, 19);
  return { startNaive, endNaive };
}
