import { expect, test } from "vitest";
import { parseElementorDiscovery } from "./elementorDiscovery.ts";

test("parseElementorDiscovery keeps well-formed forms and slugs", () => {
  const result = parseElementorDiscovery({
    per_form: [
      {
        form_id: "f1",
        form_name: "Contact",
        total: 4,
        last_30_days: 2,
        sources: { google_ads: 3, facebook: 1 },
        slugs: ["home"],
        sample_referer: "https://x.test",
      },
    ],
    per_slug: [
      {
        slug: "home",
        submissions: 4,
        google_ads_submissions: 3,
        sample_gad_campaignids: ["123", 456],
      },
    ],
  });
  expect(result.per_form[0].sources).toStrictEqual({
    google_ads: 3,
    facebook: 1,
  });
  expect(result.per_form[0].form_name).toBe("Contact");
  expect(result.per_slug[0].sample_gad_campaignids).toStrictEqual([
    "123",
    "456",
  ]);
});

test("parseElementorDiscovery tolerates missing and malformed data", () => {
  expect(parseElementorDiscovery(null)).toStrictEqual({
    per_form: [],
    per_slug: [],
  });
  const result = parseElementorDiscovery({
    per_form: [null, { form_id: 7, total: "3" }],
    per_slug: "nope",
  });
  expect(result.per_form.length).toBe(1);
  expect(result.per_form[0].form_id).toBe("7");
  expect(result.per_form[0].total).toBe(0);
  expect(result.per_form[0].slugs).toBe(undefined);
  expect(result.per_slug).toStrictEqual([]);
});
