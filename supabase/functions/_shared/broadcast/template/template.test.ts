import {
  assert,
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
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

Deno.test("renderTemplate replaces fields, fallbacks and unknowns", () => {
  const vars = buildTemplateVars({ contact_name: "דנה כהן", email: "d@x.co" });
  assertStrictEquals(renderTemplate("היי {{first_name}}!", vars), "היי דנה!");
  assertStrictEquals(renderTemplate("{{ contact_name }}", vars), "דנה כהן");
  assertStrictEquals(renderTemplate("{{city|תל אביב}}", vars), "תל אביב");
  assertStrictEquals(renderTemplate("[{{missing}}]", vars), "[]");
  assertStrictEquals(renderTemplate("{{EMAIL}}", vars), "d@x.co");
});

Deno.test("renderTemplate escapes values, not markup, in html mode", () => {
  const vars = { contact_name: "<b>x</b>" };
  assertStrictEquals(
    renderTemplate("<p>{{contact_name}}</p>", vars, { html: true }),
    "<p>&lt;b&gt;x&lt;/b&gt;</p>",
  );
});

Deno.test("custom fields from file headers are addressable", () => {
  const vars = buildTemplateVars({
    contact_name: "a",
    extra: { "Home City": "חיפה", עיר: "ירושלים", email: "spoof@x.co" },
  });
  assertStrictEquals(renderTemplate("{{home_city}}", vars), "חיפה");
  assertStrictEquals(renderTemplate("{{Home City}}", vars), "חיפה");
  assertStrictEquals(renderTemplate("{{עיר}}", vars), "ירושלים");
  // A custom column cannot override a standard field that has a value.
  const withEmail = buildTemplateVars({
    email: "real@x.co",
    extra: { email: "spoof@x.co" },
  });
  assertStrictEquals(withEmail.email, "real@x.co");
  assertStrictEquals(fieldKeyFromHeader("  First Name "), "first_name");
});

Deno.test("templateFieldKeys lists referenced fields", () => {
  assertEquals(templateFieldKeys("{{a}} {{b|x}} {{a}}"), ["a", "b"]);
});

Deno.test("normalizePhone handles Israeli formats", () => {
  assertStrictEquals(normalizePhone("050-123-4567"), "972501234567");
  assertStrictEquals(normalizePhone("+972 50 1234567"), "972501234567");
  assertStrictEquals(normalizePhone("00972501234567"), "972501234567");
  assertStrictEquals(normalizePhone(""), null);
});

Deno.test("sanitizeEmailHtml strips scripts, handlers and js urls", () => {
  const out = sanitizeEmailHtml(
    '<p onclick="x()">hi</p><script>alert(1)</script><a href="javascript:alert(1)">l</a>',
  );
  assertStrictEquals(out.includes("script"), false);
  assertStrictEquals(out.includes("onclick"), false);
  assertStrictEquals(out.includes("javascript:"), false);
  assertStrictEquals(htmlToText("<p>a</p><p>b &amp; c</p>"), "a\nb & c");
});

Deno.test("raw email HTML keeps styles but drops scripts", () => {
  const raw =
    '<html><head><style>.a{color:red}</style></head><body><table onclick="x()"><tr><td class="a">{{first_name}}</td></tr></table><script>alert(1)</script></body></html>';
  const out = sanitizeRawEmailHtml(raw);
  assert(out.includes("<style>.a{color:red}</style>"));
  assert(out.includes("<table>"));
  assertStrictEquals(out.includes("script"), false);
  assertStrictEquals(out.includes("onclick"), false);
});

Deno.test("footer goes before </body> or at the end", () => {
  assertStrictEquals(
    injectBeforeBodyEnd("<html><body>x</body></html>", "<p>f</p>"),
    "<html><body>x<p>f</p></body></html>",
  );
  assertStrictEquals(
    injectBeforeBodyEnd("<div>x</div>", "<p>f</p>"),
    "<div>x</div><p>f</p>",
  );
});

Deno.test("attachments go to Resend by URL, only from our bucket", () => {
  const prefix = attachmentUrlPrefix("https://x.supabase.co/");
  assertStrictEquals(
    prefix,
    "https://x.supabase.co/storage/v1/object/public/broadcast-media/",
  );
  const list = [
    { name: "price.pdf", url: `${prefix}t1/attachments/a-price.pdf` },
    { name: "evil.pdf", url: "https://evil.example/file.pdf" },
    { name: "", url: `${prefix}t1/x.pdf` },
    null,
  ];
  assertEquals(emailAttachmentsForResend(list, prefix), [
    { filename: "price.pdf", path: `${prefix}t1/attachments/a-price.pdf` },
  ]);
  assertEquals(emailAttachmentsForResend("nope", prefix), []);
});

Deno.test("editor images get a responsive width", () => {
  assertMatch(
    wrapEmailHtml('<p>x</p><img src="a.png" width="300">'),
    /<img style="max-width:100%;height:auto" src="a.png" width="300">/,
  );
  assertMatch(
    wrapEmailHtml('<img style="width:10px" src="b.png">'),
    /<img style="width:10px" src="b.png">/,
  );
});

Deno.test(
  "toEmailAttachments drops malformed items and keeps optional fields",
  () => {
    assertEquals(toEmailAttachments(null), []);
    assertEquals(toEmailAttachments({ name: "a", url: "u" }), []);
    assertEquals(
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
  },
);
