import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import type { Database } from "../_shared/database.types.ts";
import {
  fetchCampaignLevelRecords,
  type CrmRecordRow,
} from "../_shared/ads-sync/campaign-records.ts";
import { isRecord } from "../_shared/ads-sync/is-record.ts";
import { analyzePeriods, eventPeriodWindows } from "./periods.ts";

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

    const supabase = createClient<Database>(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const windows = eventPeriodWindows(eventDates, daysBeforeEvent, new Date());

    const { data: table, error: tableError } = await supabase
      .from("crm_tables")
      .select("id, integration_type, integration_settings, category")
      .eq("id", tableId)
      .maybeSingle();
    if (tableError) {
      console.error("Error fetching table:", tableError);
      return new Response(JSON.stringify({ error: "Failed to fetch table" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Campaign-level rows of the event windows, as the reports count them
    // (ad set and ad rows repeat the campaign's spend and results), paged.
    let records: CrmRecordRow[] = [];
    try {
      if (windows.length > 0) {
        records = await fetchCampaignLevelRecords(supabase, {
          tableIds: [tableId],
          sinceYmd: windows.reduce(
            (min, w) => (w.startDate < min ? w.startDate : min),
            windows[0].startDate,
          ),
          untilYmd: windows.reduce(
            (max, w) => (w.endDate > max ? w.endDate : max),
            windows[0].endDate,
          ),
        });
      }
    } catch (recordsError) {
      console.error("Error fetching records:", recordsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch records" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (records.length === 0) {
      const { data: anyRecord } = await supabase
        .from("crm_records")
        .select("id")
        .eq("table_id", tableId)
        .limit(1);
      if (!anyRecord || anyRecord.length === 0) {
        return new Response(
          JSON.stringify({ error: "No records found for this table" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    const { eventPeriods, campaignPeriodData } = analyzePeriods({
      records,
      table: table
        ? {
            ...table,
            integration_settings: isRecord(table.integration_settings)
              ? table.integration_settings
              : null,
          }
        : null,
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
