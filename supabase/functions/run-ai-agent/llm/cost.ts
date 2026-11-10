// Rough per-model pricing (USD per 1M tokens in/out) for the usage panel.
// Unknown models log tokens with a null cost rather than a wrong one.
/** Preserves the existing estimateLLMCostUSD provider boundary. */
export function estimateLLMCostUSD(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number | null {
  if (!tokensIn && !tokensOut) {
    return null;
  }
  const m = (model || "").toLowerCase();
  const price: [number, number] | null = m.includes("gpt-4o-mini")
    ? [0.15, 0.6]
    : m.includes("gpt-4o")
      ? [2.5, 10]
      : m.includes("gpt-4.1-mini")
        ? [0.4, 1.6]
        : m.includes("gpt-4.1")
          ? [2, 8]
          : m.includes("haiku")
            ? [0.8, 4]
            : m.includes("sonnet")
              ? [3, 15]
              : m.includes("gemini")
                ? [0.1, 0.4]
                : null;
  if (!price) {
    return null;
  }
  return +((tokensIn * price[0] + tokensOut * price[1]) / 1e6).toFixed(6);
}
