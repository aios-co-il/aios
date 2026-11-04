// What the providers answer, as far as the worker reads it. Every field is optional where it
// is read (providerJson), because nothing checks the shape of a provider's answer.

/** What Kling answers for a task (submit and poll); `code` is non-zero on an error. */
export interface KlingTaskResponse {
  code: number;
  message: string;
  data: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: { videos?: Array<{ url?: string }> };
  };
}

/** What the Flows video API answers for a job (submit and poll). */
export interface ElevenLabsFlowResponse {
  id: string;
  status: string;
  content_url: string;
  error_message: string;
  failure_reason: string;
}

/** What Higgsfield answers for a request (submit and status). */
export interface HiggsfieldRequestResponse {
  request_id: string;
  status: string;
  video: { url?: string };
  error: string;
  message: string;
}

/** What OpenRouter's video API answers for a job (submit and poll). */
export interface OpenRouterVideoResponse {
  id: string;
  status: string;
  usage: { cost?: number | string };
  error: string | { message?: string };
}

/** GET /v1/voices. */
export interface ElevenLabsVoicesResponse {
  voices: Array<{ voice_id?: string; category?: string }>;
}

/** POST /v1/text-to-speech/{voice}/with-timestamps. */
export interface ElevenLabsSpeechResponse {
  audio_base64: string;
  alignment: SpeechAlignment | null;
}

/** Character timings of a line, as ElevenLabs returns them. */
export interface SpeechAlignment {
  characters: Array<string>;
  character_start_times_seconds: Array<number>;
  character_end_times_seconds: Array<number>;
}

/** Gemini's token counts for one request. */
export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

/** Inline audio, in either of the casings Gemini answers with. */
export interface GeminiInlineData {
  data?: string;
  mimeType?: string;
  mime_type?: string;
}

/** POST /v1beta/models/{model}:generateContent with an AUDIO response. */
export interface GeminiSpeechResponse {
  candidates: Array<{
    content?: {
      parts?: Array<{
        inlineData?: GeminiInlineData;
        inline_data?: GeminiInlineData;
      }>;
    };
  }>;
  usageMetadata: GeminiUsage;
}

/** GET /api/v1/generation. */
export interface OpenRouterGenerationResponse {
  data: { total_cost?: number | string };
}
