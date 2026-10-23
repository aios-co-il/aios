import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateVars,
  fieldKeyFromHeader,
  normalizePhone,
  renderTemplate,
  templateFieldKeys,
} from "./template-vars.ts";
import {
  htmlToText,
  injectBeforeBodyEnd,
  sanitizeEmailHtml,
  sanitizeRawEmailHtml,
  wrapEmailHtml,
} from "./email-html.ts";
import {
  attachmentUrlPrefix,
  emailAttachmentsForResend,
  toEmailAttachments,
} from "./email-attachments.ts";

test("renderTemplate replaces fields, fallbacks and unknowns", () => {
  const vars = buildTemplateVars({ contact_name: "דנה כהן", email: "d@x.co" });
  assert.equal(renderTemplate("היי {{first_name}}!", vars), "היי דנה!");
  assert.equal(renderTemplate("{{ contact_name }}", vars), "דנה כהן");
  assert.equal(renderTemplate("{{city|תל אביב}}", vars), "תל אביב");
  assert.equal(renderTemplate("[{{missing}}]", vars), "[]");
  assert.equal(renderTemplate("{{EMAIL}}", vars), "d@x.co");
});

test("renderTemplate escapes values, not markup, in html mode", () => {
  const vars = { contact_name: "<b>x</b>" };
  assert.equal(
    renderTemplate("<p>{{contact_name}}</p>", vars, { html: true }),
    "<p>&lt;b&gt;x&lt;/b&gt;</p>",
  );
});

test("custom fields from file headers are addressable", () => {
  const vars = buildTemplateVars({
    contact_name: "a",
    extra: { "Home City": "חיפה", עיר: "ירושלים", email: "spoof@x.co" },
  });
  assert.equal(renderTemplate("{{home_city}}", vars), "חיפה");
  assert.equal(renderTemplate("{{Home City}}", vars), "חיפה");
  assert.equal(renderTemplate("{{עיר}}", vars), "ירושלים");
  // A custom column cannot override a standard field that has a value.
  const withEmail = buildTemplateVars({
    email: "real@x.co",
    extra: { email: "spoof@x.co" },
  });
  assert.equal(withEmail.email, "real@x.co");
  assert.equal(fieldKeyFromHeader("  First Name "), "first_name");
});

test("templateFieldKeys lists referenced fields", () => {
  assert.deepEqual(templateFieldKeys("{{a}} {{b|x}} {{a}}"), ["a", "b"]);
});

test("normalizePhone handles Israeli formats", () => {
  assert.equal(normalizePhone("050-123-4567"), "972501234567");
  assert.equal(normalizePhone("+972 50 1234567"), "972501234567");
  assert.equal(normalizePhone("00972501234567"), "972501234567");
  assert.equal(normalizePhone(""), null);
});

test("sanitizeEmailHtml strips scripts, handlers and js urls", () => {
  const out = sanitizeEmailHtml(
    '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>',
  );
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("onclick"), false);
  assert.equal(out.includes("javascript:"), false);
  assert.equal(htmlToText("<p>a</p><p>b &amp; c</p>"), "a\nb & c");
});

test("raw email HTML keeps styles but drops scripts", () => {
  const raw =
    '<html><head><style>.a{color:red}</style></head><body><table onclick="x()"><tr><td class="a">{{first_name}}</td></tr></table><script>alert(1)</script></body></html>';
  const out = sanitizeRawEmailHtml(raw);
  assert.ok(out.includes("<style>.a{color:red}</style>"));
  assert.ok(out.includes("<table>"));
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("onclick"), false);
});

test("footer goes before </body> or at the end", () => {
  assert.equal(
    injectBeforeBodyEnd("<html><body>x</body></html>", "<p>f</p>"),
    "<html><body>x<p>f</p></body></html>",
  );
  assert.equal(
    injectBeforeBodyEnd("<div>x</div>", "<p>f</p>"),
    "<div>x</div><p>f</p>",
  );
});

test("attachments go to Resend by URL, only from our bucket", () => {
  const prefix = attachmentUrlPrefix("https://x.supabase.co/");
  assert.equal(
    prefix,
    "https://x.supabase.co/storage/v1/object/public/broadcast-media/",
  );
  const list = [
    { name: "price.pdf", url: `${prefix}t1/attachments/a-price.pdf` },
    { name: "evil.pdf", url: "https://evil.example/file.pdf" },
    { name: "", url: `${prefix}t1/x.pdf` },
    null,
  ];
  assert.deepEqual(emailAttachmentsForResend(list, prefix), [
    { filename: "price.pdf", path: `${prefix}t1/attachments/a-price.pdf` },
  ]);
  assert.deepEqual(emailAttachmentsForResend("nope", prefix), []);
});

test("editor images get a responsive width", () => {
  assert.match(
    wrapEmailHtml('<p>x</p><img src="a.png" width="300">'),
    /<img style="max-width:100%;height:auto" src="a.png" width="300">/,
  );
  assert.match(
    wrapEmailHtml('<img style="width:10px" src="b.png">'),
    /<img style="width:10px" src="b.png">/,
  );
});

test("toEmailAttachments drops malformed items and keeps optional fields", () => {
  assert.deepEqual(toEmailAttachments(null), []);
  assert.deepEqual(toEmailAttachments({ name: "a", url: "u" }), []);
  assert.deepEqual(
    toEmailAttachments([
      "x",
      null,
      ["a", "u"],
      { url: "https://x/a.pdf" },
      { name: "no-url.pdf" },
      { name: 1, url: "https://x/b.pdf" },
      { name: "min.pdf", url: "https://x/min.pdf", size: "big", path: 3 },
      {
        name: "full.pdf",
        url: "https://x/full.pdf",
        path: "t/full.pdf",
        size: 1234,
        content_type: "application/pdf",
        extra: true,
      },
    ]),
    [
      { name: "min.pdf", url: "https://x/min.pdf" },
      {
        name: "full.pdf",
        url: "https://x/full.pdf",
        path: "t/full.pdf",
        size: 1234,
        content_type: "application/pdf",
      },
    ],
  );
});
