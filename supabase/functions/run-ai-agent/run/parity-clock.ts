/** Freezes Date without changing timers or the SDK's scheduling. */
export function fixedDate() {
  const NativeDate = globalThis.Date;
  const now = NativeDate.parse("2026-11-09T12:00:00Z");
  class FixedDate extends NativeDate {
    constructor(value?: string | number) {
      super(value ?? now);
    }
    static override now() {
      return now;
    }
  }
  globalThis.Date = FixedDate as DateConstructor;
  return {
    restore() {
      globalThis.Date = NativeDate;
    },
  };
}
