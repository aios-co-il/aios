// broadcast-unsubscribe — public unsubscribe link at the end of every mailing
// (email footer and WhatsApp last line). ?r=<recipient_id>.
//
//   GET  → confirmation page with a button (a link preview must not
//          unsubscribe anyone)
//   POST → adds the recipient's phone and email to the tenant's mailing
//          blacklist (broadcast_opt_outs, channel 'all'), so mailings skip
//          them on WhatsApp and email. Email one-click
//          (List-Unsubscribe-Post) posts here too.
//
// Public (verify_jwt = false in config.toml).
import { serviceClient } from "../_shared/supabase-clients.ts";
import { addToBlacklist } from "../_shared/broadcast/blacklist.ts";

const STYLE = `body{font-family:system-ui,Arial,sans-serif;background:#f6f7f9;color:#222;display:flex;
min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;padding:32px 40px;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);text-align:center;max-width:420px}
h1{font-size:20px;margin:0 0 8px}p{color:#555;margin:0 0 16px}
button{background:#dc2626;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:15px;cursor:pointer}`;

const page = (
  title: string,
  body: string,
) => `<!doctype html><html lang="he" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>הסרה מרשימת הדיוור</title><style>${STYLE}</style></head>
<body><div class="card"><h1>${title}</h1>${body}</div></body></html>`;

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const UUID = /^[0-9a-f-]{36}$/i;

type RecipientRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string | null;
  phone: string | null;
  email: string | null;
};

/** The recipient plus the CRM record's current phone and email. */
async function addressesOf(
  db: ReturnType<typeof serviceClient>,
  r: RecipientRow,
) {
  const phones = [r.entity_type === "wa_group" ? null : r.phone];
  const emails = [r.email];
  if (r.entity_id && (r.entity_type === "lead" || r.entity_type === "client")) {
    const table = r.entity_type === "lead" ? "leads" : "clients";
    const { data } = await db
      .from(table)
      .select("phone, email")
      .eq("id", r.entity_id)
      .eq("tenant_id", r.tenant_id)
      .maybeSingle();
    if (data) {
      phones.push(data.phone);
      emails.push(data.email);
    }
  }
  return { phones, emails };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const recipientId = url.searchParams.get("r") ?? "";
  if (!UUID.test(recipientId))
    return html(page("קישור לא תקין", "<p>הקישור אינו תקין.</p>"), 400);

  if (req.method === "GET") {
    return html(
      page(
        "הסרה מרשימת הדיוור",
        `<p>לאחר ההסרה לא יישלחו אליך עוד דיוורים, לא בוואטסאפ ולא באימייל.</p>
<form method="post"><button type="submit">הסירו אותי</button></form>`,
      ),
    );
  }
  if (req.method !== "POST") return html(page("שגיאה", ""), 405);

  try {
    const db = serviceClient();
    const { data: r } = await db
      .from("broadcast_recipients")
      .select("id, tenant_id, entity_type, entity_id, phone, email")
      .eq("id", recipientId)
      .maybeSingle();
    if (!r) return html(page("הקישור פג או לא נמצא", ""), 404);

    await addToBlacklist(
      db,
      r.tenant_id,
      await addressesOf(db, r),
      "unsubscribe_link",
    );
    await db
      .from("broadcast_recipients")
      .update({ status: "opted_out" })
      .eq("id", r.id);

    return html(page("הוסרת בהצלחה ✓", "<p>לא יישלחו אליך עוד דיוורים.</p>"));
  } catch (e) {
    console.error("[broadcast-unsubscribe]", e);
    return html(page("אירעה שגיאה, נסה/י שוב מאוחר יותר", ""), 500);
  }
});
