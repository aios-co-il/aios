import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  buildDailyRetentionBrief,
  buildRetentionScan,
  hasRetentionIntent,
  rankRetentionClient,
} from "./client-retention.ts";

const NOW = Date.parse("2026-09-25T08:00:00Z");
const RECENT = "2026-09-20T08:00:00Z";
const STALE = "2026-08-01T08:00:00Z";

Deno.test("churn mood and critical pulse are act-now", () => {
  const churn = rankRetentionClient(
    {
      client_id: "1",
      client_name: "אורן",
      mood_status: "churn_risk",
      pulse_status: "healthy",
      last_client_call_at: RECENT,
      has_campaign_snapshot: true,
    },
    NOW,
  );
  assertStrictEquals(churn?.band, "act_now");
  assertStrictEquals(churn?.suggested_mood, "churn_risk");

  const critical = rankRetentionClient(
    {
      client_id: "2",
      client_name: "בילבי",
      mood_status: "happy",
      pulse_status: "critical",
      last_client_call_at: RECENT,
      has_campaign_snapshot: true,
    },
    NOW,
  );
  assertStrictEquals(critical?.band, "act_now");
  assertStrictEquals(critical?.next_action, "שיחת שימור היום ועדכון יומן.");
  assertNotMatch(critical?.next_action || "", /לא לשלוח הודעה/);
});

Deno.test("stale call is act-now only for a connected campaign client", () => {
  const stale = rankRetentionClient(
    {
      client_id: "3",
      client_name: "דני",
      mood_status: "happy",
      pulse_status: "healthy",
      last_client_call_at: STALE,
      has_campaign_snapshot: true,
    },
    NOW,
  );
  assertStrictEquals(stale?.band, "act_now");
  assertStrictEquals(stale?.suggested_mood, "wavering");

  const noTable = rankRetentionClient(
    {
      client_id: "4",
      client_name: "רות",
      mood_status: "happy",
      pulse_status: null,
      last_client_call_at: null,
      has_campaign_snapshot: false,
    },
    NOW,
  );
  assertStrictEquals(noTable, null);
});

Deno.test("warning is watch and a fresh healthy client is steady", () => {
  const warning = rankRetentionClient(
    {
      client_id: "5",
      client_name: "גל",
      mood_status: "happy",
      pulse_status: "warning",
      last_client_call_at: RECENT,
      has_campaign_snapshot: true,
    },
    NOW,
  );
  assertStrictEquals(warning?.band, "watch");

  const scan = buildRetentionScan(
    [
      {
        client_id: "5",
        client_name: "גל",
        mood_status: "happy",
        pulse_status: "warning",
        last_client_call_at: RECENT,
        has_campaign_snapshot: true,
      },
      {
        client_id: "6",
        client_name: "נועה",
        mood_status: "happy",
        pulse_status: "healthy",
        last_client_call_at: RECENT,
        has_campaign_snapshot: true,
      },
      {
        client_id: "1",
        client_name: "אורן",
        mood_status: "churn_risk",
        pulse_status: "healthy",
        last_client_call_at: RECENT,
        has_campaign_snapshot: true,
      },
    ],
    NOW,
  );
  assertStrictEquals(scan.act_now_count, 1);
  assertStrictEquals(scan.watch_count, 1);
  assertStrictEquals(scan.steady_count, 1);
  assertStrictEquals(scan.items[0].client_name, "אורן");
  assertMatch(scan.whatsapp_digest, /לטיפול עכשיו: 1/);
  assertNotMatch(scan.whatsapp_digest, /לא לשלוח הודעה|אין שליחה ללקוח/);
});

Deno.test(
  "daily brief names churn and critical clients and counts call gaps",
  () => {
    const brief = buildDailyRetentionBrief(
      [
        {
          client_id: "1",
          client_name: "אורן",
          mood_status: "churn_risk",
          pulse_status: "healthy",
          last_client_call_at: RECENT,
          has_campaign_snapshot: true,
        },
        {
          client_id: "2",
          client_name: "בילבי",
          mood_status: "happy",
          pulse_status: "critical",
          last_client_call_at: RECENT,
          has_campaign_snapshot: true,
        },
        {
          client_id: "3",
          client_name: "דני",
          mood_status: "happy",
          pulse_status: "healthy",
          last_client_call_at: STALE,
          has_campaign_snapshot: true,
        },
        {
          client_id: "4",
          client_name: "גל",
          mood_status: "happy",
          pulse_status: "warning",
          last_client_call_at: RECENT,
          has_campaign_snapshot: true,
        },
      ],
      NOW,
    );
    assertStrictEquals(brief.serious_count, 2);
    assertStrictEquals(brief.call_gap_count, 1);
    assertStrictEquals(brief.watch_count, 1);
    assertMatch(brief.message, /אורן/);
    assertMatch(brief.message, /בילבי/);
    assertNotMatch(brief.message, /דני/);
    assertMatch(brief.message, /פער שיחות 14 יום: 1/);
    assertNotMatch(brief.message, /לא לשלוח הודעה|אין שליחה ללקוח/);
  },
);

Deno.test("retention phrasing does not require the word pulse", () => {
  assertStrictEquals(hasRetentionIntent("תעשי בדיקת שימור"), true);
  assertStrictEquals(hasRetentionIntent("מה מצב הקמפיינים"), false);
});
