// An expected rejection that becomes a JSON error response.
export class WebhookError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
