import { BlockNoteSchema, defaultStyleSpecs } from "@blocknote/core";
import { createReactStyleSpec } from "@blocknote/react";

// Fonts every mail client has, so the email looks the same everywhere.
export const FONTS = [
  { text: "ברירת מחדל", value: "" },
  { text: "Arial", value: "Arial, Helvetica, sans-serif" },
  { text: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { text: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { text: "Georgia", value: "Georgia, serif" },
  { text: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { text: "Courier New", value: "'Courier New', Courier, monospace" },
];
export const SIZES = [
  "",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
  "28px",
  "32px",
];

// Custom styles export as inline CSS (style="font-family / font-size"), which
// is what email clients understand. Bold, italic, underline, colors and
// alignment come from BlockNote's default toolbar.
const fontFamily = createReactStyleSpec(
  { type: "fontFamily", propSchema: "string" },
  {
    render: ({ value, contentRef }) => (
      <span style={{ fontFamily: value }} ref={contentRef} />
    ),
  },
);
const fontSize = createReactStyleSpec(
  { type: "fontSize", propSchema: "string" },
  {
    render: ({ value, contentRef }) => (
      <span style={{ fontSize: value }} ref={contentRef} />
    ),
  },
);

export const emailEditorSchema = BlockNoteSchema.create({
  styleSpecs: { ...defaultStyleSpecs, fontFamily, fontSize },
});
export type EmailEditor = typeof emailEditorSchema.BlockNoteEditor;
