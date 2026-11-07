import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { CALLER_TABLE_COLUMNS } from "./caller-table.ts";
import {
  fetchCampaignLevelRecords,
  type RecordsClient,
} from "../_shared/ads-sync/campaign-records.ts";
import { loadTableData, type TableDataDeps } from "./table-data.ts";
import { eventPeriodWindows } from "./event-windows.ts";
import { analyzePeriods } from "./periods.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      tableId,
      eventDates,
      daysBeforeEvent = 7,
      campaignFilter,
      analysisType = "comparison",
      customInstructions,
    } = await req.json();

    if (!tableId || !eventDates || eventDates.length === 0) {
      return new Response(
        JSON.stringify({ error: "tableId and eventDates are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const windows = eventPeriodWindows(eventDates, daysBeforeEvent, new Date());
    // The caller must be able to read the table, as in the app, before any
    // service-role read of its rows (AIO-495).
    const tableData = await loadTableData(
      liveTableDataDeps(req),
      tableId,
      windows,
    );
    if (!tableData.ok) {
      return new Response(JSON.stringify({ error: tableData.error }), {
        status: tableData.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { table, records } = tableData;

    const { eventPeriods, campaignPeriodData } = analyzePeriods({
      records,
      table,
      windows,
      campaignFilter,
      byCampaign: analysisType === "raw_table",
    });

    // Sort periods by date (newest first)
    eventPeriods.sort((a, b) => {
      const [dayA, monthA] = a.eventDate.split(".").map(Number);
      const [dayB, monthB] = b.eventDate.split(".").map(Number);
      if (monthA !== monthB) return monthB - monthA;
      return dayB - dayA;
    });

    // For raw_table, return data without AI analysis
    if (analysisType === "raw_table") {
      // Sort campaign data by event date then campaign name
      campaignPeriodData.sort((a, b) => {
        const [dayA, monthA] = a.eventDate.split(".").map(Number);
        const [dayB, monthB] = b.eventDate.split(".").map(Number);
        if (monthA !== monthB) return monthB - monthA;
        if (dayA !== dayB) return dayB - dayA;
        return a.campaignName.localeCompare(b.campaignName);
      });

      return new Response(
        JSON.stringify({
          success: true,
          periods: eventPeriods,
          campaignData: campaignPeriodData,
          analysisType: "raw_table",
          daysBeforeEvent,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Prepare prompt for AI
    let analysisPrompt = "";

    if (analysisType === "comparison") {
      analysisPrompt = `אתה אנליסט שיווק דיגיטלי מומחה. קיבלת נתוני קמפיינים של פייסבוק מסביב לאירועים (וובינרים).

**תאריכי האירועים (${daysBeforeEvent} ימים לפני כל אירוע):**
${eventPeriods
  .map(
    (p) => `
📅 **אירוע ${p.eventDate}** (${p.startDate} עד ${p.endDate}):
   - סה"כ הוצאה: ₪${p.metrics.totalSpend.toLocaleString()}
   - סה"כ לידים: ${p.metrics.totalLeads}
   - עלות לליד: ₪${p.metrics.avgCostPerLead}
   - CTR ממוצע: ${p.metrics.avgCtr}%
   - CPM ממוצע: ₪${p.metrics.avgCpm}
   - קליקים: ${p.metrics.totalClicks.toLocaleString()}
   - חשיפות: ${p.metrics.totalImpressions.toLocaleString()}
   - קמפיינים: ${p.metrics.campaigns.join(", ") || "לא צוין"}
`,
  )
  .join("\n")}

**משימות:**
1. השווה את הביצועים בין התקופות - מי הכי טוב ומי הכי גרוע ולמה
2. זהה מגמות ושינויים משמעותיים בין התקופות
3. תן ציון כולל (1-10) לביצועים עם הסבר קצר
4. הצע 3 המלצות קונקרטיות לשיפור לפני האירוע הבא

**פורמט התשובה:** עברית, עם כותרות ברורות (##), אימוג'ים, ונקודות. תשובה מקצועית אבל ברורה.`;
    } else if (analysisType === "trends") {
      analysisPrompt = `אתה אנליסט שיווק דיגיטלי מומחה. נתח את המגמות בנתוני הקמפיינים הבאים:

${eventPeriods.map((p) => `📅 ${p.eventDate}: ₪${p.metrics.totalSpend} הוצאה, ${p.metrics.totalLeads} לידים, ₪${p.metrics.avgCostPerLead} לליד`).join("\n")}

זהה:
1. מגמות עולות/יורדות
2. תקופות חריגות
3. דפוסים חוזרים
4. תחזית לאירוע הבא

פורמט: עברית, כותרות ##, אימוג'ים.`;
    } else {
      analysisPrompt = `אתה יועץ שיווק דיגיטלי. בהתבסס על הנתונים הבאים, תן המלצות לשיפור:

${eventPeriods.map((p) => `📅 ${p.eventDate}: ₪${p.metrics.totalSpend} הוצאה, ${p.metrics.totalLeads} לידים, ₪${p.metrics.avgCostPerLead} לליד, CTR: ${p.metrics.avgCtr}%`).join("\n")}

תן 5 המלצות קונקרטיות ומעשיות לשיפור הביצועים.
פורמט: עברית, ממוספר, אימוג'ים.`;
    }

    // Add custom instructions if provided
    if (customInstructions) {
      analysisPrompt += `\n\n**הנחיות נוספות מהמשתמש:**\n${customInstructions}`;
    }

    // Call OpenAI
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "אתה אנליסט שיווק דיגיטלי מומחה. תן תשובות מקצועיות, ברורות ומועילות בעברית.",
            },
            { role: "user", content: analysisPrompt },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded. Please try again later.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Payment required. Please add credits to your workspace.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const analysisText =
      aiData.choices?.[0]?.message?.content || "לא התקבל ניתוח";

    return new Response(
      JSON.stringify({
        success: true,
        periods: eventPeriods,
        analysis: analysisText,
        analysisType,
        daysBeforeEvent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-campaign-data:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

/**
 * The data step's reads: the table as the caller, the caller's row access
 * and the rows themselves with the service client.
 */
function liveTableDataDeps(req: Request): TableDataDeps {
  const callerDb = userClient(req.headers.get("Authorization") ?? "");
  const serviceDb = serviceClient();
  return {
    loadCallerTable: (id) =>
      callerDb
        .from("crm_tables")
        .select(CALLER_TABLE_COLUMNS)
        .eq("id", id)
        .maybeSingle(),
    callerMayReadRows: async (tableId) => {
      const { data: auth, error: authError } = await callerDb.auth.getUser();
      if (authError || !auth.user) {
        return false;
      }
      const { data, error } = await serviceDb.rpc("user_can_access_crm_table", {
        _user_id: auth.user.id,
        _table_id: tableId,
      });
      if (error) {
        throw new Error(`user_can_access_crm_table: ${error.message}`);
      }
      return data === true;
    },
    readRecords: ({ tableId, tenantId, sinceYmd, untilYmd }) =>
      fetchCampaignLevelRecords(asRecordsClient(serviceDb), {
        tableIds: [tableId],
        tenantIds: [tenantId],
        sinceYmd,
        untilYmd,
      }),
    probeRecords: (tableId, tenantId) =>
      serviceDb
        .from("crm_records")
        .select("id")
        .eq("table_id", tableId)
        .eq("tenant_id", tenantId)
        .limit(1),
  };
}

/**
 * The service client as the paged reader sees it. Checking the generated
 * client against RecordsClient compares every table's query builder and hits
 * TypeScript's depth limit (TS2589), so the check stops at `from`.
 */
function asRecordsClient(client: {
  from(table: "crm_records"): unknown;
}): RecordsClient {
  return client as RecordsClient;
}
