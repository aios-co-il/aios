// Email HTML building for broadcasts: sanitizing, wrapping, footers and the
// plain-text alternative. Pure: no Deno / browser APIs.
import {
  escapeHtml,
  renderTemplate,
  type TemplateVars,
} from "./template-vars.ts";

/**
 * Minimal server-side clean-up of tenant-authored email HTML. The editor
 * already sanitizes with DOMPurify; this is a second line of defence for
 * HTML that reaches the API another way.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(
      /<\s*(script|style|iframe|object|embed|form|meta|link)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(
      /<\s*(script|style|iframe|object|embed|form|meta|link)\b[^>]*\/?>/gi,
      "",
    )
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src)\s*=\s*("|')\s*(javascript|vbscript|data):[^"']*\2/gi,
      '$1="#"',
    );
}

/**
 * Clean-up for ready-made email HTML (html_mode). Keeps <style>, <head>,
 * <meta> and tables so designed emails render as built; removes only what
 * can run code.
 */
export function sanitizeRawEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(
      /<\s*(script|iframe|object|embed|form)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /(href|src)\s*=\s*("|')\s*(javascript|vbscript):[^"']*\2/gi,
      '$1="#"',
    );
}

/** Put a footer before </body> when the HTML is a full document, else append. */
export function injectBeforeBodyEnd(html: string, footer: string): string {
  const idx = html.search(/<\/body\s*>/i);
  return idx === -1
    ? html + footer
    : html.slice(0, idx) + footer + html.slice(idx);
}

/** Plain text → simple RTL HTML (escape + line breaks). */
export function textToEmailHtml(body: string): string {
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222" dir="rtl">${escapeHtml(body).replace(/\n/g, "<br/>")}</div>`;
}

/** Wrap rich editor HTML in the same RTL container as plain text emails. */
export function wrapEmailHtml(innerHtml: string): string {
  // Editor images keep their size but never overflow narrow (mobile) clients.
  const body = innerHtml.replace(
    /<img\b(?![^>]*\sstyle=)/gi,
    '<img style="max-width:100%;height:auto"',
  );
  return `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222" dir="rtl">${body}</div>`;
}

/** Strip tags for the plain-text alternative of an HTML email. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Final email HTML + plain-text alternative for one recipient.
 * - htmlMode: ready-made HTML, sent as-is (scripts stripped), footer before </body>.
 * - bodyHtml: rich-editor HTML, wrapped in the default RTL container.
 * - otherwise: plain text body.
 */
export function buildEmailContent(opts: {
  bodyHtml?: string | null;
  bodyText?: string | null;
  htmlMode?: boolean | null;
  vars: TemplateVars;
  footerHtml?: string;
}): { html: string; text: string } {
  const footer = opts.footerHtml ?? "";
  const text = renderTemplate(opts.bodyText || "", opts.vars);
  if (opts.bodyHtml && opts.htmlMode) {
    const html = renderTemplate(
      sanitizeRawEmailHtml(opts.bodyHtml),
      opts.vars,
      {
        html: true,
      },
    );
    return {
      html: injectBeforeBodyEnd(html, footer),
      text: text || htmlToText(html),
    };
  }
  if (opts.bodyHtml) {
    const html = renderTemplate(sanitizeEmailHtml(opts.bodyHtml), opts.vars, {
      html: true,
    });
    return {
      html: wrapEmailHtml(html) + footer,
      text: text || htmlToText(html),
    };
  }
  return { html: textToEmailHtml(text) + footer, text };
}
