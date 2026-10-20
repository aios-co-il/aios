import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemplateVars,
  fieldKeyFromHeader,
  htmlToText,
  injectBeforeBodyEnd,
  sanitizeRawEmailHtml,
  normalizePhone,
  renderTemplate,
  sanitizeEmailHtml,
  templateFieldKeys,
} from "./broadcast-template.ts";
import { resolveTargetEntity } from "./broadcast-automation.ts";

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

test("resolveTargetEntity picks the trigger's lead or client", () => {
  assert.deepEqual(
    resolveTargetEntity({}, { id: "L1" }, "lead_status_changed"),
    {
      type: "lead",
      id: "L1",
    },
  );
  assert.deepEqual(
    resolveTargetEntity({}, { id: "C1" }, "client_status_changed"),
    {
      type: "client",
      id: "C1",
    },
  );
  assert.deepEqual(
    resolveTargetEntity(
      { entity: "client" },
      { id: "L1", client_id: "C9" },
      "lead_status_changed",
    ),
    { type: "client", id: "C9" },
  );
  assert.equal(
    resolveTargetEntity({ entity: "client" }, { id: "L1" }, "lead_created"),
    null,
  );
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
