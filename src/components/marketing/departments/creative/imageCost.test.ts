import { expect, test } from "vitest";
import {
  addCost,
  costFromApiUsage,
  emptyCostTotals,
  estimateGptImage1,
  estimateTextTokens,
  imageOutputTokens,
  inferImageCost,
  summarizeStoredImageCosts,
  usdFromImageTokens,
} from "./imageCost.ts";

test("official high square output is 4160 tokens / $0.1664", () => {
  expect(imageOutputTokens("high", "1024x1024")).toBe(4160);
  expect(usdFromImageTokens(0, 0, 4160)).toBe(0.1664);
});

test("official high portrait output is 6240 tokens / $0.25", () => {
  expect(imageOutputTokens("high", "1024x1536")).toBe(6240);
  expect(usdFromImageTokens(0, 0, 6240)).toBe(0.2496);
});

test("medium square matches the published $0.042 ladder", () => {
  expect(imageOutputTokens("medium", "1024x1024")).toBe(1056);
  expect(usdFromImageTokens(0, 0, 1056)).toBe(0.04224);
});

test("estimate includes prompt tokens and reference image tokens", () => {
  const cost = estimateGptImage1({
    prompt: "תפתח צ'אט. נסגור לך טיסה.",
    quality: "high",
    size: "1024x1024",
    referenceCount: 1,
  });
  expect(cost.outputTokens).toBe(4160);
  expect(cost.imageInTokens).toBe(1440);
  expect(cost.textTokens > 8).toBeTruthy();
  expect(cost.costUsd > 0.1664).toBeTruthy();
  expect(cost.source).toBe("official_table");
  expect(cost.totalTokens).toBe(
    cost.textTokens + cost.imageInTokens + cost.outputTokens,
  );
});

test("API usage with details is treated as exact", () => {
  const cost = costFromApiUsage(
    {
      input_tokens: 2000,
      output_tokens: 4160,
      input_tokens_details: { text_tokens: 560, image_tokens: 1440 },
    },
    "high",
    "1024x1024",
    1,
  );
  expect(cost).toBeTruthy();
  expect(cost?.source).toBe("api");
  expect(cost?.textTokens).toBe(560);
  expect(cost?.imageInTokens).toBe(1440);
  expect(cost?.outputTokens).toBe(4160);
  expect(cost?.costUsd).toBe(usdFromImageTokens(560, 1440, 4160));
});

test("API usage without details uses input_tokens as text only", () => {
  const cost = costFromApiUsage(
    { input_tokens: 800, output_tokens: 4160 },
    "high",
    "1024x1024",
  );
  expect(cost?.textTokens).toBe(800);
  expect(cost?.imageInTokens).toBe(0);
});

test("empty API usage is ignored so the official table can be used", () => {
  expect(costFromApiUsage({}, "high", "1024x1024")).toBe(null);
  expect(costFromApiUsage(null, "high", "1024x1024")).toBe(null);
});

test("Hebrew prompt estimates more tokens than the same Latin length", () => {
  expect(
    estimateTextTokens("רודוס עכשיו") > estimateTextTokens("Rhodes now"),
  ).toBeTruthy();
});

test("inferred leftover images count as official output only", () => {
  const totals = addCost(
    emptyCostTotals(),
    inferImageCost("high", "1024x1024"),
  );
  expect(totals.images).toBe(1);
  expect(totals.exactImages).toBe(0);
  expect(totals.estimatedImages).toBe(1);
  expect(totals.costUsd).toBe(0.1664);
});

test("project summary falls back to marketing_runs when no stored image cost exists", () => {
  const totals = summarizeStoredImageCosts(
    [{ imageUrl: "https://example.com/a.png" }],
    "high",
    [
      {
        tokens_in: 200,
        tokens_out: 4160,
        cost_usd: 0.18,
        model: "gpt-image-1",
      },
    ],
  );
  expect(totals.images).toBe(1);
  expect(totals.tokens).toBe(4360);
  expect(totals.costUsd).toBe(0.18);
});

test("project summary prefers stored costs and fills gaps from the official table", () => {
  const stored = costFromApiUsage(
    { input_tokens: 100, output_tokens: 4160 },
    "high",
    "1024x1024",
  );
  expect(stored).toBeTruthy();
  const totals = summarizeStoredImageCosts(
    [
      {
        generationCost: stored,
        imageUrl: "https://example.com/a.png",
        format: "1:1",
      },
      { imageUrl: "https://example.com/b.png", format: "1:1" },
    ],
    "high",
  );
  expect(totals.images).toBe(2);
  expect(totals.exactImages).toBe(1);
  expect(totals.estimatedImages).toBe(1);
});
