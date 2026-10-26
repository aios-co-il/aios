import {
  assert,
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  OPENAI_CREDIT_BALANCE_UNAVAILABLE_REASON,
  buildOpenAiBillingStatus,
  extractDailyCostBuckets,
  extractDailyUsageBuckets,
  formatOpenAiBillingWhatsApp,
  isSuperAdminRole,
  monthUtcBounds,
  redactSecretsFromText,
  sumCompletionsUsage,
  sumOrganizationCosts,
} from "./openai-billing.mjs";

Deno.test("super_admin guard helper", () => {
  assertStrictEquals(isSuperAdminRole("super_admin"), true);
  assertStrictEquals(isSuperAdminRole("owner"), false);
  assertStrictEquals(isSuperAdminRole("campaigner"), false);
});

Deno.test("sumOrganizationCosts aggregates daily buckets", () => {
  const payload = {
    data: [
      {
        results: [
          {
            amount: { value: 1.25, currency: "usd" },
            line_item: "gpt-4o-mini",
          },
          { amount: { value: 0.75, currency: "usd" }, line_item: "embeddings" },
        ],
      },
      {
        results: [
          { amount: { value: 2, currency: "usd" }, line_item: "gpt-4o-mini" },
        ],
      },
    ],
  };
  const sum = sumOrganizationCosts(payload);
  assertStrictEquals(sum.total_cost, 4);
  assertStrictEquals(sum.currency, "usd");
  assertStrictEquals(sum.line_items[0].name, "gpt-4o-mini");
  assertStrictEquals(sum.line_items[0].value, 3.25);
});

Deno.test("sumCompletionsUsage aggregates tokens", () => {
  const payload = {
    data: [
      {
        results: [
          { input_tokens: 100, output_tokens: 40, num_model_requests: 2 },
          { input_tokens: 50, output_tokens: 10, num_model_requests: 1 },
        ],
      },
    ],
  };
  const u = sumCompletionsUsage(payload);
  assertStrictEquals(u.input_tokens, 150);
  assertStrictEquals(u.output_tokens, 50);
  assertStrictEquals(u.total_tokens, 200);
  assertStrictEquals(u.num_model_requests, 3);
});

Deno.test("buildOpenAiBillingStatus never fabricates remaining credit", () => {
  const status = buildOpenAiBillingStatus({
    costs: {
      data: [
        {
          results: [
            { amount: { value: 12.5, currency: "usd" }, line_item: "x" },
          ],
        },
      ],
    },
    period: monthUtcBounds(new Date("2026-08-15T12:00:00Z")),
  });
  assertStrictEquals(status.remaining_credit, null);
  assertStrictEquals(status.remaining_credit_available, false);
  assertMatch(
    status.remaining_credit_reason,
    /does not expose remaining prepaid credit/i,
  );
  assertStrictEquals(status.current_month_usage_cost, 12.5);
  assertStrictEquals(status.period, "2026-08");
  assert(status.ok);
});

Deno.test("WhatsApp summary is concise and mentions unavailable credit", () => {
  const status = buildOpenAiBillingStatus({
    costs: {
      data: [
        {
          results: [
            { amount: { value: 3.2, currency: "usd" }, line_item: "chat" },
          ],
        },
      ],
    },
    usage: {
      data: [
        {
          results: [
            { input_tokens: 1000, output_tokens: 200, num_model_requests: 5 },
          ],
        },
      ],
    },
    period: monthUtcBounds(new Date("2026-08-04T00:00:00Z")),
  });
  const text = formatOpenAiBillingWhatsApp(status);
  assertMatch(text, /לא זמינה/);
  assertMatch(text, /\$3\.20/i);
  assertNotMatch(text, /sk-/);
  assert(text.length < 800);
  assert(OPENAI_CREDIT_BALANCE_UNAVAILABLE_REASON.includes("billing"));
});

Deno.test("extractDailyCostBuckets preserves dates and sums", () => {
  const payload = {
    data: [
      {
        start_time: 1756684800,
        results: [{ amount: { value: 1.5 }, line_item: "gpt-4o-mini" }],
      },
      {
        start_time: 1756771200,
        results: [{ amount: { value: 2.0 }, line_item: "gpt-4o-mini" }],
      },
    ],
  };
  const days = extractDailyCostBuckets(payload);
  assertStrictEquals(days.length, 2);
  assertStrictEquals(days[0].cost, 1.5);
  assertStrictEquals(days[1].cost, 2);
});

Deno.test("extractDailyUsageBuckets aggregates per day", () => {
  const payload = {
    data: [
      {
        start_time: 1756684800,
        results: [
          { input_tokens: 100, output_tokens: 50, num_model_requests: 2 },
        ],
      },
    ],
  };
  const days = extractDailyUsageBuckets(payload);
  assertStrictEquals(days[0].total_tokens, 150);
  assertStrictEquals(days[0].num_model_requests, 2);
});

Deno.test("redactSecretsFromText strips API keys", () => {
  const redacted = redactSecretsFromText("Bearer sk-abc1234567890xyz error");
  assertNotMatch(redacted, /sk-abc/);
  assertMatch(redacted, /\*\*\*/);
});
