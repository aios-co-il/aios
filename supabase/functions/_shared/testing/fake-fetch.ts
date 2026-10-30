/** A scripted reply; the default is a confirmed Manus send. */
type FakeReply = { status?: number; body?: unknown };

/** One recorded request, with its JSON body parsed. */
type FakeCall = {
  url: string;
  body: Record<string, unknown>;
  init: RequestInit;
};

/**
 * Records fetch calls and answers each with the next scripted reply; the last
 * reply repeats once the script runs out.
 */
export function fakeFetch(replies: FakeReply[] = []) {
  const calls: FakeCall[] = [];
  const queue = [...replies];
  const impl = (url: string | URL | Request, init: RequestInit = {}) => {
    const raw = typeof init.body === "string" ? init.body : "{}";
    calls.push({ url: String(url), body: JSON.parse(raw), init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    const { status = 200, body = { success: true, messageId: "m1" } } =
      next || {};
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { impl, calls };
}
