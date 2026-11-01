import { serviceClient } from "../_shared/supabase-clients.ts";
import { ensureReportShare } from "./share.ts";
import {
  sendScheduledWhatsApp,
  type WhatsAppSenderDetail,
  workerWhatsAppDeps,
} from "./whatsapp-channel.ts";

const jsonHeaders = { "Content-Type": "application/json" };

const htmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[char] || char,
  );

Deno.serve(async (req) => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const workerSecret = Deno.env.get("REPORT_WORKER_SECRET") || "";
  const bearer = req.headers.get("Authorization") || "";
  const authorized =
    (!!serviceRoleKey && bearer === `Bearer ${serviceRoleKey}`) ||
    (!!workerSecret && bearer === `Bearer ${workerSecret}`);
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const admin = serviceClient();
  const whatsappDeps = workerWhatsAppDeps(admin, supabaseUrl, serviceRoleKey);
  const staleLockCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await admin
    .from("report_schedules")
    .update({ locked_at: null })
    .lt("locked_at", staleLockCutoff);
  const { data: schedules, error } = await admin
    .from("report_schedules")
    .select("*, clients(name, phone, email, whatsapp_group_id)")
    .eq("enabled", true)
    .is("locked_at", null)
    .lte("next_run_at", new Date().toISOString())
    .order("next_run_at")
    .limit(25);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const schedule of schedules || []) {
    const targetId =
      schedule.target_type === "table"
        ? schedule.table_id
        : schedule.dashboard_id;
    if (!targetId) {
      // report_schedule_target_matches keeps this from happening.
      console.error("[scheduled-report-worker] no target", schedule.id);
      continue;
    }
    const { data: claimed } = await admin
      .from("report_schedules")
      .update({ locked_at: new Date().toISOString() })
      .eq("id", schedule.id)
      .is("locked_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const channelResults: Record<string, { ok: boolean; error?: string }> = {};

    try {
      const shareUrl = await ensureReportShare(admin, schedule, targetId);
      const clientName = schedule.clients?.name || "לקוח";
      const message = `${schedule.message?.trim() || `הדוח החדש של ${clientName} מוכן לצפייה`}\n\n📊 ${shareUrl}`;
      const channels: string[] = schedule.channels || [];

      let whatsappSender: WhatsAppSenderDetail | undefined;
      if (channels.includes("whatsapp")) {
        const whatsapp = await sendScheduledWhatsApp(
          whatsappDeps,
          schedule,
          message,
        ).catch((channelError) => ({
          ok: false,
          error:
            channelError instanceof Error
              ? channelError.message
              : String(channelError),
          sender: undefined,
        }));
        channelResults.whatsapp = { ok: whatsapp.ok, error: whatsapp.error };
        whatsappSender = whatsapp.sender;
      }

      if (channels.includes("email")) {
        try {
          const recipients: string[] =
            schedule.email_recipients?.length > 0
              ? schedule.email_recipients
              : schedule.clients?.email
                ? [schedule.clients.email]
                : [];
          if (recipients.length === 0) throw new Error("No email recipients");
          const resendKey = Deno.env.get("RESEND_API_KEY") || "";
          if (!resendKey) throw new Error("RESEND_API_KEY is missing");
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `${Deno.env.get("RESEND_FROM_NAME") || "AfterLead"} <${Deno.env.get("RESEND_FROM_EMAIL") || "noreply@aios.co.il"}>`,
              to: recipients,
              subject: schedule.email_subject || `דוח ${clientName}`,
              html: `<div dir="rtl" style="font-family:Arial,sans-serif"><p>${htmlEscape(schedule.message || `הדוח החדש של ${clientName} מוכן לצפייה`)}</p><p><a href="${shareUrl}">לצפייה בדוח המלא</a></p></div>`,
            }),
          });
          if (!response.ok) throw new Error(await response.text());
          channelResults.email = { ok: true };
        } catch (channelError) {
          channelResults.email = {
            ok: false,
            error:
              channelError instanceof Error
                ? channelError.message
                : String(channelError),
          };
        }
      }

      const values = Object.values(channelResults);
      const succeeded = values.filter((result) => result.ok).length;
      const status =
        succeeded === values.length
          ? "sent"
          : succeeded > 0
            ? "partial"
            : "failed";
      await admin.from("report_deliveries").insert({
        schedule_id: schedule.id,
        tenant_id: schedule.tenant_id,
        client_id: schedule.client_id,
        target_type: schedule.target_type,
        target_id: targetId,
        channels,
        status,
        details: {
          share_url: shareUrl,
          channels: channelResults,
          ...(whatsappSender ? { whatsapp_sender: whatsappSender } : {}),
        },
      });
      await admin
        .from("report_schedules")
        .update({ last_run_at: new Date().toISOString(), locked_at: null })
        .eq("id", schedule.id);
      results.push({
        schedule_id: schedule.id,
        status,
        channels: channelResults,
      });
    } catch (scheduleError) {
      const message =
        scheduleError instanceof Error
          ? scheduleError.message
          : String(scheduleError);
      await admin.from("report_deliveries").insert({
        schedule_id: schedule.id,
        tenant_id: schedule.tenant_id,
        client_id: schedule.client_id,
        target_type: schedule.target_type,
        target_id: targetId,
        channels: schedule.channels || [],
        status: "failed",
        details: { error: message },
      });
      // Advance the cadence even on failure to avoid a tight retry loop.
      await admin
        .from("report_schedules")
        .update({ last_run_at: new Date().toISOString(), locked_at: null })
        .eq("id", schedule.id);
      results.push({
        schedule_id: schedule.id,
        status: "failed",
        error: message,
      });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: jsonHeaders,
  });
});
