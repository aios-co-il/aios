import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(result.per_form[0].sources, { google_ads: 3, facebook: 1 });
  assert.equal(result.per_form[0].form_name, "Contact");
  assert.deepEqual(result.per_slug[0].sample_gad_campaignids, ["123", "456"]);
});

test("parseElementorDiscovery tolerates missing and malformed data", () => {
  assert.deepEqual(parseElementorDiscovery(null), {
    per_form: [],
    per_slug: [],
  });
  const result = parseElementorDiscovery({
    per_form: [null, { form_id: 7, total: "3" }],
    per_slug: "nope",
  });
  assert.equal(result.per_form.length, 1);
  assert.equal(result.per_form[0].form_id, "7");
  assert.equal(result.per_form[0].total, 0);
  assert.equal(result.per_form[0].slugs, undefined);
  assert.deepEqual(result.per_slug, []);
});
