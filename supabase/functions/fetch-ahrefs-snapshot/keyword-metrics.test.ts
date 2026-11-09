import { assertEquals } from "jsr:@std/assert@1";
import { numericMetric } from "./keyword-metrics.ts";
Deno.test(
  "Ahrefs numeric metrics cannot persist object or non-finite values",
  () => {
    assertEquals(
      [
        numericMetric(12),
        numericMetric("1.5"),
        numericMetric(null),
        numericMetric({}),
        numericMetric(Infinity),
      ],
      [12, 1.5, null, null, null],
    );
  },
);
