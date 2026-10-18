/**
 * Where to scroll the chat so a new Carmen answer is read from its start.
 * A short answer fits on screen, so we go to the bottom as usual. A long one
 * stays pinned at its first line and the reader scrolls down. We never pull
 * the view back up if the reader already scrolled further down.
 */
export function answerScrollTarget(opts: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** Top of the latest answer, in the list's scroll coordinates; null when there is none. */
  answerTop: number | null;
  padding?: number;
}): number | null {
  const bottom = Math.max(0, opts.scrollHeight - opts.clientHeight);
  const target =
    opts.answerTop === null
      ? bottom
      : Math.max(0, Math.min(bottom, opts.answerTop - (opts.padding ?? 12)));
  return target > opts.scrollTop ? target : null;
}

/** Scrolls `list` so `answer` (the latest Carmen reply) shows from its start. */
export function scrollToAnswerStart(
  list: HTMLElement | null,
  answer: HTMLElement | null,
) {
  if (!list) return;
  const answerTop = answer
    ? answer.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop
    : null;
  const target = answerScrollTarget({
    scrollTop: list.scrollTop,
    scrollHeight: list.scrollHeight,
    clientHeight: list.clientHeight,
    answerTop,
  });
  if (target !== null) list.scrollTo({ top: target });
}
