// Nano Banana Pro (Gemini 3 Pro Image) still generation and prompt edits.
// Reference images go inline; the first one is the image the prompt talks about.

export const NANO_BANANA_PRO_MODELS = [
  "gemini-3-pro-image",
  "gemini-3-pro-image-preview",
];

/** Per-image estimate for 1K–2K output; Gemini bills images by output tokens. */
export const NANO_BANANA_PRO_IMAGE_USD = 0.134;

export type GeminiAspectRatio = "1:1" | "16:9" | "9:16" | "4:5" | "3:4" | "4:3";

export const aspectRatioForSize = (
  size: string,
  format?: string,
): GeminiAspectRatio => {
  if (
    format === "16:9" ||
    format === "9:16" ||
    format === "1:1" ||
    format === "4:5"
  )
    return format;
  if (size === "1536x1024") return "16:9";
  if (size === "1024x1536") return "9:16";
  return "1:1";
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
};

const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function generateGeminiImage({
  apiKey,
  prompt,
  images,
  mimeTypes,
  aspectRatio,
}: {
  apiKey: string;
  prompt: string;
  images: Uint8Array[];
  mimeTypes?: string[];
  aspectRatio: GeminiAspectRatio;
}): Promise<{
  bytes: Uint8Array;
  model: string;
  usage: Record<string, unknown> | null;
}> {
  const parts = [
    ...images.map((bytes, index) => ({
      inline_data: {
        mime_type: mimeTypes?.[index] ?? "image/png",
        data: toBase64(bytes),
      },
    })),
    { text: prompt },
  ];
  let lastError = "";
  for (const model of NANO_BANANA_PRO_MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio, imageSize: "2K" },
          },
        }),
      },
    );
    if (response.status === 404) {
      lastError = `${model}: 404`;
      continue;
    }
    if (!response.ok)
      throw new Error(
        `Gemini image error: ${response.status} - ${await response.text()}`,
      );
    const data = await response.json();
    const candidateParts = data?.candidates?.[0]?.content?.parts ?? [];
    const image = candidateParts.find(
      (part: Record<string, unknown>) =>
        (part.inlineData ?? part.inline_data) as unknown,
    );
    const inline = (image?.inlineData ?? image?.inline_data) as
      { data?: string } | undefined;
    if (!inline?.data) {
      const reason =
        data?.candidates?.[0]?.finishReason ??
        data?.promptFeedback?.blockReason ??
        "no image";
      throw new Error(`Gemini returned no image (${reason})`);
    }
    return {
      bytes: fromBase64(inline.data),
      model,
      usage: data?.usageMetadata ?? null,
    };
  }
  throw new Error(`Gemini image model not available (${lastError})`);
}
