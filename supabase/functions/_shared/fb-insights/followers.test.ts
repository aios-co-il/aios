import { assertEquals } from "jsr:@std/assert@1";
import { countNewFollowers } from "./followers.ts";

/** A row's deduplicated action counts, the way buildInsightRecord sums them. */
function countOfRow(counts: Record<string, number>) {
  return (types: string[]) =>
    types.reduce((sum, type) => sum + (counts[type] ?? 0), 0);
}

Deno.test("countNewFollowers", async (t) => {
  await t.step("reads only the follow action types", () => {
    const countOf = countOfRow({
      like: 3,
      instagram_profile_follow_v2: 2,
      page_engagement: 50,
      post_engagement: 20,
    });
    assertEquals(countNewFollowers(countOf), 5);
  });

  await t.step("either Instagram key counts the same follows once", () => {
    assertEquals(
      countNewFollowers(countOfRow({ instagram_profile_follow: 7 })),
      7,
    );
    assertEquals(
      countNewFollowers(countOfRow({ instagram_profile_follow_v2: 7 })),
      7,
    );
    // Both keys are aliases of one count, so the larger wins (MAX, not SUM).
    assertEquals(
      countNewFollowers(
        countOfRow({
          instagram_profile_follow: 7,
          instagram_profile_follow_v2: 9,
        }),
      ),
      9,
    );
  });

  await t.step("Facebook and Instagram follows add up", () => {
    assertEquals(
      countNewFollowers(
        countOfRow({ like: 12, instagram_profile_follow_v2: 7 }),
      ),
      19,
    );
  });

  await t.step("a row without follows has none", () => {
    assertEquals(countNewFollowers(countOfRow({ link_click: 30 })), 0);
  });
});
