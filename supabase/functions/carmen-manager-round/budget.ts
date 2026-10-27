/**
 * Time and external-API budget of one round call. The cron fires every 15
 * minutes; one call stops taking new work before the edge-function limit and
 * the next call resumes from the per-tenant cursors.
 */
export class RoundBudget {
  readonly #deadline: number;
  readonly #apiPool: { left: number };
  readonly #clock: () => number;

  /** A budget of `ms` milliseconds and `apiCalls` external calls from now. */
  static create(
    ms: number,
    apiCalls: number,
    clock: () => number = Date.now,
  ): RoundBudget {
    return new RoundBudget(clock() + ms, { left: apiCalls }, clock);
  }

  private constructor(
    deadline: number,
    apiPool: { left: number },
    clock: () => number,
  ) {
    this.#deadline = deadline;
    this.#apiPool = apiPool;
    this.#clock = clock;
  }

  /** Milliseconds left, never negative. */
  remainingMs(): number {
    return Math.max(0, this.#deadline - this.#clock());
  }

  /** True while at least `ms` milliseconds are left. */
  hasTime(ms: number): boolean {
    return this.remainingMs() >= ms;
  }

  /**
   * Takes one external API call (the LLM calls of the chat and group update
   * collectors, AIO-252 and AIO-254); false when none are left.
   */
  takeApiCall(): boolean {
    if (this.#apiPool.left <= 0) {
      return false;
    }
    this.#apiPool.left -= 1;
    return true;
  }

  /** A budget for one tenant: at most `ms` of the time left, sharing the API calls. */
  slice(ms: number): RoundBudget {
    const deadline = Math.min(this.#deadline, this.#clock() + ms);
    return new RoundBudget(deadline, this.#apiPool, this.#clock);
  }
}
