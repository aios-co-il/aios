// The shape every video and lip-sync provider shares, so the jobs, the UI and Carmen never
// depend on which engine made a clip.

/** The tenant's provider keys (index.ts resolveMediaKeys); a missing key falls back to env. */
export interface ProviderKeys {
  elevenLabsKey?: string | null;
  googleKey?: string | null;
  higgsfieldKeyId?: string | null;
  higgsfieldKeySecret?: string | null;
  klingAccessKey?: string | null;
  klingSecretKey?: string | null;
  openRouterKey?: string | null;
  openRouterVideoModel?: string | null;
}

/** `fetch`, injectable so tests answer for the provider. */
export type FetchImpl = typeof fetch;

/** What a clip or a lip sync is made from; each provider reads the fields it needs. */
export interface MediaInput {
  imageBytes?: Uint8Array | null;
  imageUrl?: string | null;
  audioBytes?: Uint8Array | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  prompt?: string;
  negativePrompt?: string;
  line?: string;
  motionPrompt?: string | null;
  durationS?: number;
  aspect?: string;
  talking?: boolean;
  generateAudio?: boolean;
  model?: string;
}

export interface Estimate {
  credits: number;
  usd: number;
}

export interface EstimateInput {
  durationS?: number;
  talking?: boolean;
}

export interface SubmitResult {
  jobId: string;
  /** The model the job runs on, when it is not the provider's default. */
  model?: string;
}

/** A job's state; `costUsd` is what the provider charged, when it says. */
export interface PollResult {
  status: "pending" | "succeeded" | "failed";
  url?: string;
  bytes?: Uint8Array;
  costUsd?: number;
  error?: string;
}

export interface VideoProvider {
  name: string;
  model: string;
  /** Speaks a quoted line with matching lips, so a talking scene needs no lip-sync pass. */
  nativeSpeech?: boolean;
  talkingModel?: string;
  /** Fetches the still from a URL, so the worker signs the private file. */
  needsPublicImage?: boolean;
  estimate(input: EstimateInput): Estimate;
  submit(input: MediaInput): Promise<SubmitResult>;
  poll(jobId: string): Promise<PollResult>;
}

export interface LipsyncProvider extends VideoProvider {
  /** The picture the provider animates: the still or the scene's clip. */
  needs: "image" | "video";
  /** Fetches the picture and the voice from URLs. */
  needsPublicMedia?: boolean;
}
