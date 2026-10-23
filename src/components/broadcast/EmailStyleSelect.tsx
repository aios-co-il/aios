import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import { emailEditorSchema, FONTS, SIZES } from "./emailEditorSchema";

/** Formatting-toolbar dropdown for the custom fontFamily / fontSize styles. */
export function EmailStyleSelect({
  styleKey,
  options,
}: {
  styleKey: "fontFamily" | "fontSize";
  options: { text: string; value: string }[];
}) {
  const editor = useBlockNoteEditor<
    typeof emailEditorSchema.blockSchema,
    typeof emailEditorSchema.inlineContentSchema,
    typeof emailEditorSchema.styleSchema
  >();
  const Components = useComponentsContext()!;
  const current = editor.getActiveStyles()[styleKey];

  const apply = (value: string) => {
    if (value)
      return styleKey === "fontFamily"
        ? editor.addStyles({ fontFamily: value })
        : editor.addStyles({ fontSize: value });
    return styleKey === "fontFamily"
      ? editor.removeStyles({ fontFamily: "" })
      : editor.removeStyles({ fontSize: "" });
  };

  return (
    <Components.FormattingToolbar.Select
      items={options.map((o) => ({
        text: o.text,
        icon: null,
        isSelected: (current || "") === o.value,
        onClick: () => {
          editor.focus();
          apply(o.value);
        },
      }))}
    />
  );
}

/** BlockNote's default formatting toolbar plus email font and size pickers. */
export function EmailFormattingToolbar() {
  return (
    <FormattingToolbar>
      <EmailStyleSelect key="font" styleKey="fontFamily" options={FONTS} />
      <EmailStyleSelect
        key="size"
        styleKey="fontSize"
        options={SIZES.map((s) => ({
          text: s ? s.replace("px", "") : "גודל",
          value: s,
        }))}
      />
      {getFormattingToolbarItems()}
    </FormattingToolbar>
  );
}
