// Production-shaped campaign rows behind the 2026-11-06 07:06 pulse run: the
// 10 campaign_exception lines it sent, a lead campaign that spends with 0 leads,
// and a Google campaign Google marks ENDED. Spend per day is Production's.
// Avieli's ids are real, so its fingerprints match the ones already logged in
// pulse_instant_alert_log; the other clients and tables are placeholders.

import {
  AWARENESS,
  google,
  LANDING_PAGE_TRAFFIC,
  LEADS,
  LINK_TRAFFIC,
  meta,
  SALES,
  table,
} from "./report-goal-fixture-rows.ts";

/** The run's day; the 7 full days are 10-30..11-05 and today is partial. */
export const TODAY = "2026-11-06";

export const AVIELI = "0117effa-063f-4579-989c-cdf8ec923fb9";
const AVIELI_GOOGLE = "9956cb10-80b2-4b20-9092-1c62cb2ac992";
const AVIELI_META = "ccb8fbda-fd8f-4883-93e3-a59dc87563ab";

export const REPORT_GOAL_TABLES = [
  table(
    AVIELI_GOOGLE,
    AVIELI,
    "google_ads",
    { campaign_type: "ecommerce" },
    "איקומרס",
  ),
  table(AVIELI_META, AVIELI, "facebook_insights"),
  table("t-smart-air", "smart-air", "facebook_insights"),
  table("t-store", "store", "facebook_insights"),
  table("t-instagram", "instagram", "facebook_insights"),
  table("t-traffic", "traffic", "facebook_insights"),
  table("t-leads", "leads", "facebook_insights"),
  table(
    "t-google-ended",
    "google-ended",
    "google_ads",
    {
      campaign_type: "leads",
      operational_campaign_states: {
        "g-ended": { status: "ENABLED", primary_status: "ENDED" },
      },
    },
    "Google Ads",
  ),
];

/** The day index of 11-02 and 11-03, when stray results came in. */
const NOV_2 = 3;
const NOV_3 = 4;

export const TODAY_RECORDS = [
  ...google(
    AVIELI_GOOGLE,
    "23920790354",
    "פרפורמנס מקס | רחב על  האתר | 8.6",
    [37.16, 15.2, 49.1, 71.8, 65.88, 54.79, 131.57, 13.1],
  ),
  ...meta(AVIELI_META, "1209", "קמפיין PURCHASE 3.11", SALES, [
    null,
    null,
    null,
    null,
    31.05,
    140.12,
    120.72,
    5.01,
  ]),
  ...meta(
    AVIELI_META,
    "1207",
    "קמפיין מכירות סרטונים",
    { ...SALES, optimization_goal: "VALUE" },
    [100.01, 39.51, 85.54, 88.61, 76.83, 22.73, 20.53, 2.37],
    (day) => (day === NOV_3 ? { conversations: 1 } : {}),
  ),
  ...meta(
    "t-smart-air",
    "1201",
    "‎‎‎SmartAir - Genesis - שווקי חג המולד‎‎ 13 / 10",
    { ...SALES, result_kind: "initiate_checkout" },
    [111.17, 0, 0, 0, 0, null, null, null],
    (day) => ({ leads: [7, 1, 2, 1, 0][day] }),
  ),
  ...meta(
    "t-smart-air",
    "1202",
    "סול לטינו",
    LANDING_PAGE_TRAFFIC,
    [42.37, 49.24, 61.66, 46.61, 48.54, 50.49, 46.58, 4.5],
    () => ({ results: 160, lp_or_form_views: 160, link_clicks: 230 }),
  ),
  ...meta("t-store", "1203", "‎מבצע אטרף סניפים 22-31.10‎ - Copy", AWARENESS, [
    null,
    null,
    null,
    100.84,
    129.65,
    142.11,
    153.05,
    21.1,
  ]),
  ...meta("t-store", "1204", "מבצע אטרף סניפים 22-31.10", AWARENESS, [
    151.66,
    68.75,
    0,
    null,
    null,
    null,
    null,
    null,
  ]),
  ...meta(
    "t-store",
    "1205",
    "‏‏‏‏‏‏קמפיין מעורבות | סרטונים‏ 2",
    AWARENESS,
    [19.71, 63.73, 58.85, 41.9, 43.65, 49.23, 50.04, 6.94],
  ),
  ...meta(
    "t-instagram",
    "1206",
    "‎‎קמפיין טראפיק לאינסטגרם‎ -05.08‎",
    { ...LINK_TRAFFIC, optimization_goal: "PROFILE_VISIT" },
    [96.86, 80.7, 94.49, 108.19, 98.89, 92.13, 102.37, 11.79],
    (day) => (day === NOV_2 ? { leads: 3 } : {}),
  ),
  ...meta(
    "t-traffic",
    "1208",
    "‎תנועה עם טרגוט חדש",
    LINK_TRAFFIC,
    [10.81, 7.3, 11.4, 11.47, 6.18, 12.1, 8.15, 1.44],
    (day) => (day === NOV_2 ? { leads: 1 } : {}),
  ),
  ...meta("t-leads", "1210", "קמפיין לידים -עמוד נחיתה 4.11", LEADS, [
    null,
    null,
    null,
    null,
    null,
    51.77,
    105.48,
    25.2,
  ]),
  ...google("t-google-ended", "g-ended", "חיפוש חנוכה", [
    40,
    40,
    40,
    40,
    40,
    40,
    20,
    null,
  ]),
];
