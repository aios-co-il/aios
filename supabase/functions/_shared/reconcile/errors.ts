/**
 * Platform failures the reconciliation can act on, with every message redacted
 * before it can reach a stored run or a log (AIO-238).
 */
import type { RateLimitScope, SourceErrorKind } from "./types.ts";

/** A platform failure with a kind the worker can act on. Messages are redacted. */
export class ReconcileSourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly scope: RateLimitScope;
  constructor(
    kind: SourceErrorKind,
    message: string,
    scope: RateLimitScope = "platform",
  ) {
    super(redactSecrets(message));
    this.name = "ReconcileSourceError";
    this.kind = kind;
    this.scope = scope;
  }
}

/** Error text with tokens and query strings removed, capped for storage. */
export function redactSecrets(text: unknown, max = 300): string {
  let out = String(text ?? "").replace(/%(2[26F]|3[ADF])/gi, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  return out.slice(0, max);
}

/** True for the exhausted call budget, which callers retry later instead of failing the table. */
export function isBudgetError(err: unknown): boolean {
  return err instanceof ReconcileSourceError && err.kind === "budget";
}

/** The redacted message of a caught value, Error or not. */
export function redactedMessage(err: unknown): string {
  return redactSecrets(err instanceof Error ? err.message : err);
}

const REDACTED = "[redacted]";

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(access[_-]token|refresh[_-]token|client[_-]secret|appsecret[_-]proof|developer[_-]token|api[_-]?key)(["']?\s*[:=]\s*["']?)(?!\[redacted\])[^&\s"',;)}\]]+/gi,
    `$1$2${REDACTED}`,
  ],
  [
    /(https?:\/\/[^\s?#"'<>()]+)\?(?!\[redacted\])[^\s"'<>)]*/gi,
    `$1?${REDACTED}`,
  ],
  [/\b(Bearer\s+)(?!\[redacted\])[\w.~+/=-]+/gi, `$1${REDACTED}`],
  [/(?<![A-Za-z0-9])EAA[A-Za-z0-9]{20,}/g, REDACTED],
  [/\bya29\.[\w.-]+/g, REDACTED],
];
