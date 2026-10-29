import { z } from "zod";

const str = z.string().optional().catch(undefined);

const calendarDateSchema = z
  .object({ dateTime: str, date: str })
  .optional()
  .catch(undefined);

const calendarEventSchema = z.object({
  id: str,
  summary: str,
  description: str,
  start: calendarDateSchema,
  end: calendarDateSchema,
  calendarName: str,
  calendarColor: str,
});

const calendarSchema = z.object({ id: str, name: str, color: str });

/** Each list keeps its object entries; anything else in it is dropped. */
const objectList = <S extends z.ZodTypeAny>(schema: S) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item): z.output<S>[] => {
        const parsed = schema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    );

const calendarEventsPayloadSchema = z
  .object({
    events: objectList(calendarEventSchema),
    calendars: objectList(calendarSchema),
  })
  .catch({ events: [], calendars: [] });

export type CalendarPayloadEvent = z.infer<typeof calendarEventSchema>;
export type CalendarPayloadCalendar = z.infer<typeof calendarSchema>;
export type CalendarEventsPayload = z.infer<typeof calendarEventsPayloadSchema>;

/** Narrows the get-calendar-events / unified list_events response. */
export function parseCalendarEventsPayload(
  data: unknown,
): CalendarEventsPayload {
  return calendarEventsPayloadSchema.parse(data);
}
