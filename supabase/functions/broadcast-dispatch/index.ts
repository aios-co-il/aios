// broadcast-dispatch — time-bounded, throttled sender for the broadcast module.
// Designed to be called repeatedly (every minute by pg_cron). Each invocation:
//   1. promotes due 'scheduled' broadcasts to 'sending'
//   2. for each 'sending' broadcast, sends a small paced batch of pending recipients
//      (jittered gap between sends = anti-ban), respecting daily_cap
//   3. marks a broadcast 'sent' once no pending recipients remain
//
// Sending strategy:
//   - text  → reuse send-green-api-message / send-manus-wa-message (service role)
//   - image → manus: reuse send-manus-wa-file ; green_api: call Green API sendFileByUrl
//             directly (the green file function requires a real user, not service role)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildEmailContent } from "../_shared/broadcast/template/email-html.ts";
import {
  buildTemplateVars,
  renderTemplate,
  type TemplateVars,
} from "../_shared/broadcast/template/template-vars.ts";
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
} from "../_shared/broadcast/template/email-attachments.ts";
import { isOptedOut } from "../_shared/broadcast/audience/reachability.ts";
import {
  unsubscribeUrl,
  whatsappUnsubscribeFooter,
} from "../_shared/broadcast/blacklist.ts";
import { resolveBroadcastRecipientClientId } from "./recipient-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_RUN_MS = 90_000; // stay well under the edge function execution limit
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jitter(minS: number, maxS: number, seed: number): number {
  const lo = Math.max(1, minS || 1);
  const hi = Math.max(lo, maxS || lo);
  // Deterministic-ish jitter without Math.random (varies per recipient via seed)
  const frac = ((seed * 2654435761) % 1000) / 1000;
  return Math.round((lo + frac * (hi - lo)) * 1000);
}

// Merge fields come from the recipient's vars snapshot; older rows (before
// vars existed) fall back to name / phone / email columns.
function recipientVars(r: any): TemplateVars {
  const base = buildTemplateVars({
    contact_name: r.contact_name,
    email: r.email,
    phone: r.entity_type === "wa_group" ? null : r.phone,
  });
  return { ...base, ...(r.vars && typeof r.vars === "object" ? r.vars : {}) };
}

async function invokeEdgeFn(name: string, payload: any) {
  const res = await fetch(`${SB_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_SERVICE}`,
      "Content-Type": "application/json",
      apikey: SB_SERVICE,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Direct Green API image send (sendFileByUrl) — used because send-green-api-file needs a user token.
async function greenApiSendImage(
  db: any,
  integrationId: string,
  tenantId: string,
  senderUserId: string,
  chatPhone: string,
  imageUrl: string,
  caption: string,
  broadcastId: string,
  clientId: string | null,
) {
  const { data: integ } = await db
    .from("tenant_integrations")
    .select("api_key, settings")
    .eq("id", integrationId)
    .maybeSingle();
  if (!integ?.api_key || !integ?.settings?.instance_id) {
    return { ok: false, json: { error: "green_api_not_configured" } };
  }
  const instanceId = integ.settings.instance_id;
  const apiToken = integ.api_key;
  const cc = String(
    integ.settings.country_code || integ.settings.default_country_code || "972",
  );
  let digits = String(chatPhone).replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!digits.startsWith(cc))
    digits = digits.startsWith("0") ? cc + digits.slice(1) : cc + digits;
  const chatId = `${digits}@c.us`;

  const url = `https://api.green-api.com/waInstance${instanceId}/sendFileByUrl/${apiToken}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatId,
      urlFile: imageUrl,
      fileName: "image.jpg",
      caption,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    const { error } = await db.from("chat_messages").insert({
      tenant_id: tenantId,
      client_id: clientId,
      connection_user_id: senderUserId,
      sent_by_user_id: senderUserId,
      message_text: caption || "[תמונה]",
      direction: "outbound",
      channel: "whatsapp",
      provider: "green_api",
      sender_phone: digits,
      raw_provider_data: json,
      send_kind: "broadcast",
      send_ref: broadcastId,
    });
    if (error) {
      console.error("[broadcast-dispatch] chat_messages insert failed", {
        broadcastId,
        error,
      });
    }
  }
  return { ok: res.ok, json };
}

async function sendOne(
  db: any,
  b: any,
  r: any,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const vars = recipientVars(r);
  const unsubUrl = unsubscribeUrl(SB_URL, r.id);
  // Mailings to a contact end with the unsubscribe link (not to groups).
  const body =
    renderTemplate(b.body_text || "", vars) +
    (b.channel !== "email" && r.entity_type !== "wa_group"
      ? whatsappUnsubscribeFooter(unsubUrl)
      : "");
  // Every WhatsApp send of a broadcast is stamped with it, so the client card
  // gets one entry per broadcast per client (AIO-242).
  const sendStamp = { sendKind: "broadcast", sendRef: b.id };

  // ── Email (Resend) ──
  if (b.channel === "email") {
    if (!r.email) return { ok: false, error: "missing_email" };
    const { html, text } = buildEmailContent({
      bodyHtml: b.body_html,
      bodyText: b.body_text,
      htmlMode: b.html_mode,
      vars,
      footerHtml:
        `<hr style="margin-top:24px;border:none;border-top:1px solid #eee"/>` +
        `<p style="font-family:system-ui,Arial,sans-serif;font-size:12px;color:#999" dir="rtl">` +
        `אם אינך מעוניין/ת לקבל דיוורים, ניתן <a href="${unsubUrl}">להסיר את עצמך מהרשימה</a>.</p>`,
    });
    const res = await invokeEdgeFn("send-resend-email", {
      to: r.email,
      subject: renderTemplate(b.subject || b.name, vars),
      html,
      text,
      fromEmail: b.from_email || undefined,
      fromName: b.from_name || undefined,
      replyTo: b.reply_to || undefined,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: [{ name: "broadcast_id", value: b.id }],
      attachments: emailAttachmentsForResend(
        b.attachments,
        attachmentUrlPrefix(SB_URL),
      ),
    });
    return res.ok
      ? { ok: true, messageId: res.json?.id }
      : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
  }

  // ── WhatsApp — Group broadcast (entity_type = 'wa_group') ──
  // r.phone stores the group_chat_id (e.g. "120363416882903532@g.us")
  // r.entity_id is the whatsapp_groups UUID
  if (r.entity_type === "wa_group") {
    const groupId = r.entity_id; // whatsapp_groups.id UUID
    const senderUserId = b.created_by;
    if (!senderUserId) return { ok: false, error: "missing_created_by" };
    if (!groupId) return { ok: false, error: "missing_group_entity_id" };

    try {
      const hasMedia = !!b.media_url;
      if (b.provider === "manus_wa") {
        if (hasMedia) {
          const res = await invokeEdgeFn("send-manus-wa-file", {
            groupId,
            imageUrl: b.media_url,
            caption: body,
            tenantId: b.tenant_id,
            integrationId: b.integration_id,
            senderUserId,
            ...sendStamp,
          });
          return res.ok
            ? { ok: true, messageId: res.json?.messageId }
            : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
        }
        const res = await invokeEdgeFn("send-manus-wa-message", {
          groupId,
          message: body,
          tenantId: b.tenant_id,
          integrationId: b.integration_id,
          senderUserId,
          ...sendStamp,
        });
        return res.ok
          ? { ok: true, messageId: res.json?.messageId }
          : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
      }
      // green_api
      if (hasMedia) {
        // For groups with green_api, use the group_chat_id stored in r.phone
        const groupChatId = r.phone; // stored as phone in enqueue
        if (!groupChatId) return { ok: false, error: "missing_group_chat_id" };
        const { data: integ } = await db
          .from("tenant_integrations")
          .select("api_key, settings")
          .eq("id", b.integration_id)
          .maybeSingle();
        if (!integ?.api_key || !integ?.settings?.instance_id)
          return { ok: false, error: "green_api_not_configured" };
        const url = `https://api.green-api.com/waInstance${integ.settings.instance_id}/sendFileByUrl/${integ.api_key}`;
        const res2 = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: groupChatId,
            urlFile: b.media_url,
            fileName: "image.jpg",
            caption: body,
          }),
        });
        const json2 = await res2.json().catch(() => ({}));
        if (res2.ok) {
          // Same chat history row as the text path, with the group.
          const { error } = await db.from("chat_messages").insert({
            tenant_id: b.tenant_id,
            group_id: groupId,
            connection_user_id: senderUserId,
            sent_by_user_id: senderUserId,
            message_text: body || "[תמונה]",
            direction: "outbound",
            channel: "whatsapp",
            provider: "green_api",
            raw_provider_data: json2,
            send_kind: "broadcast",
            send_ref: b.id,
          });
          if (error) {
            console.error("[broadcast-dispatch] chat_messages insert failed", {
              broadcastId: b.id,
              error,
            });
          }
        }
        return res2.ok
          ? { ok: true, messageId: json2?.idMessage }
          : { ok: false, error: JSON.stringify(json2).slice(0, 300) };
      }
      const res = await invokeEdgeFn("send-green-api-message", {
        groupId,
        message: body,
        tenantId: b.tenant_id,
        senderUserId,
        ...sendStamp,
      });
      return res.ok
        ? { ok: true, messageId: res.json?.messageId }
        : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e).slice(0, 300) };
    }
  }

  // ── WhatsApp (Green API / Manus) — individual contacts ──
  const hasMedia = !!b.media_url;
  const senderUserId = b.created_by;

  if (!senderUserId) return { ok: false, error: "missing_created_by" };
  if (!r.phone) return { ok: false, error: "missing_phone" };

  const clientId = await resolveBroadcastRecipientClientId(db, b.tenant_id, r);
  const recipientStamp = clientId ? { ...sendStamp, clientId } : sendStamp;

  try {
    if (b.provider === "manus_wa") {
      if (hasMedia) {
        const res = await invokeEdgeFn("send-manus-wa-file", {
          phoneNumber: r.phone,
          imageUrl: b.media_url,
          caption: body,
          tenantId: b.tenant_id,
          integrationId: b.integration_id,
          senderUserId,
          ...recipientStamp,
        });
        return res.ok
          ? { ok: true, messageId: res.json?.messageId }
          : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
      }
      const res = await invokeEdgeFn("send-manus-wa-message", {
        phoneNumber: r.phone,
        message: body,
        tenantId: b.tenant_id,
        integrationId: b.integration_id,
        senderUserId,
        ...recipientStamp,
      });
      return res.ok
        ? { ok: true, messageId: res.json?.messageId }
        : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
    }

    // green_api
    if (hasMedia) {
      const res = await greenApiSendImage(
        db,
        b.integration_id,
        b.tenant_id,
        senderUserId,
        r.phone,
        b.media_url,
        body,
        b.id,
        clientId,
      );
      return res.ok
        ? { ok: true, messageId: res.json?.idMessage }
        : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
    }
    const res = await invokeEdgeFn("send-green-api-message", {
      phoneNumber: r.phone,
      message: body,
      tenantId: b.tenant_id,
      senderUserId,
      ...recipientStamp,
    });
    return res.ok
      ? { ok: true, messageId: res.json?.messageId }
      : { ok: false, error: JSON.stringify(res.json).slice(0, 300) };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const db = createClient(SB_URL, SB_SERVICE, {
      auth: { persistSession: false },
    });
    const nowIso = new Date().toISOString();
    const startOfDayIso = nowIso.slice(0, 10) + "T00:00:00.000Z";

    // 1) Promote due scheduled broadcasts → sending
    await db
      .from("broadcasts")
      .update({ status: "sending", started_at: nowIso })
      .eq("status", "scheduled")
      .lte("scheduled_at", nowIso);

    // 2) Finish one-off broadcasts that have nothing left to send. Automation
    //    streams (no audience source) stay 'sending' and wait for recipients.
    const { data: maybeDone } = await db
      .from("broadcasts")
      .select("id, origin, audience_filter")
      .eq("status", "sending")
      .order("started_at", { ascending: true })
      .limit(200);
    for (const b of maybeDone || []) {
      if (b.origin === "automation" && !b.audience_filter?.source) continue;
      const { count } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .eq("status", "pending");
      if ((count ?? 0) === 0)
        await db
          .from("broadcasts")
          .update({ status: "sent", completed_at: nowIso })
          .eq("id", b.id);
    }

    // 3) Work broadcasts that still have pending recipients. Selecting only
    //    those keeps idle automation streams from filling the window.
    const { data: sending, error: candidatesError } = await db.rpc(
      "broadcast_dispatch_candidates",
      { p_limit: 5 },
    );
    if (candidatesError) throw candidatesError;

    const summary: any[] = [];
    let worked = 0;

    for (const b of sending || []) {
      if (Date.now() - startedAt > MAX_RUN_MS) break;

      // Daily cap: how many already sent today for this broadcast
      const { count: sentToday } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .gte("sent_at", startOfDayIso);
      let remainingCap = Math.max(0, (b.daily_cap ?? 300) - (sentToday ?? 0));

      // Any pending left at all?
      const { count: pendingCount } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .eq("status", "pending");

      if ((pendingCount ?? 0) === 0) {
        // Automation streams never complete; they wait for the next recipient.
        if (b.origin === "automation" && !b.audience_filter?.source) continue;
        await db
          .from("broadcasts")
          .update({ status: "sent", completed_at: nowIso })
          .eq("id", b.id);
        summary.push({ id: b.id, done: true });
        continue;
      }
      if (remainingCap <= 0) {
        summary.push({ id: b.id, capped: true });
        continue;
      }
      worked++;

      let sentThisRun = 0;
      let idx = 0;
      while (Date.now() - startedAt < MAX_RUN_MS && remainingCap > 0) {
        const { data: batch } = await db
          .from("broadcast_recipients")
          .select("*")
          .eq("broadcast_id", b.id)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);
        const r = (batch || [])[0];
        if (!r) break;

        // Re-check the blacklist at send time: an address blocked after the
        // broadcast was queued must not get it.
        if (
          r.entity_type !== "wa_group" &&
          (await isOptedOut(
            db,
            b.tenant_id,
            b.channel === "email" ? "email" : "whatsapp",
            { phone: r.phone, email: r.email },
          ))
        ) {
          await db
            .from("broadcast_recipients")
            .update({ status: "opted_out" })
            .eq("id", r.id);
          continue;
        }

        const result = await sendOne(db, b, r);
        if (result.ok) {
          await db
            .from("broadcast_recipients")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              provider_message_id: result.messageId || null,
              attempts: (r.attempts || 0) + 1,
            })
            .eq("id", r.id);
          sentThisRun++;
          remainingCap--;
        } else {
          await db
            .from("broadcast_recipients")
            .update({
              status: "failed",
              error: result.error || "send_failed",
              attempts: (r.attempts || 0) + 1,
            })
            .eq("id", r.id);
        }

        idx++;
        // Pace the next send (skip the wait after the last allowed one).
        // WhatsApp uses the configured anti-ban gap; email needs only a light gap.
        if (remainingCap > 0 && Date.now() - startedAt < MAX_RUN_MS) {
          const gapMs =
            b.channel === "email"
              ? 600 + (idx % 3) * 200
              : jitter(
                  b.throttle_min_seconds,
                  b.throttle_max_seconds,
                  idx + Math.floor(startedAt / 1000),
                );
          await sleep(gapMs);
        }
      }

      // Refresh aggregate stats
      const { count: totalCnt } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id);
      const { count: sentCnt } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .in("status", ["sent", "delivered", "read"]);
      const { count: failCnt } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .eq("status", "failed");
      const { count: stillPending } = await db
        .from("broadcast_recipients")
        .select("id", { count: "exact", head: true })
        .eq("broadcast_id", b.id)
        .eq("status", "pending");

      // Merge: delivered / opened / clicked are owned by resend-webhook.
      const { data: fresh } = await db
        .from("broadcasts")
        .select("stats")
        .eq("id", b.id)
        .maybeSingle();
      const update: any = {
        stats: {
          ...(fresh?.stats || {}),
          total: totalCnt ?? 0,
          sent: sentCnt ?? 0,
          failed: failCnt ?? 0,
        },
      };
      const isStream = b.origin === "automation" && !b.audience_filter?.source;
      if ((stillPending ?? 0) === 0 && !isStream) {
        update.status = "sent";
        update.completed_at = new Date().toISOString();
      }
      await db.from("broadcasts").update(update).eq("id", b.id);

      summary.push({
        id: b.id,
        sentThisRun,
        remainingPending: stillPending ?? 0,
      });
    }

    return new Response(
      JSON.stringify({ success: true, processed: summary.length, summary }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e: any) {
    console.error("[broadcast-dispatch]", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
