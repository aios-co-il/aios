export {};

// Supabase injects this runtime global; consumers import this module as a type.
declare global {
  const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
}
