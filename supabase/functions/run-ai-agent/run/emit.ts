// Emit function used by the streaming wrapper to push SSE events to the client.
// In non-streaming mode it's a no-op.
export type Emit = ((obj: unknown) => void) | undefined;
