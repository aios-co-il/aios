import { toast } from "sonner";

/**
 * Copies text to the clipboard and reports the outcome in a toast. Resolves
 * to whether the copy succeeded, so a caller can flash its own "copied" mark.
 * The Clipboard API is missing outside secure contexts and in some embedded
 * browsers, so its absence reports a failure instead of throwing.
 */
export async function copyToClipboard(
  text: string,
  copiedMessage = "הועתק ללוח",
  description?: string,
): Promise<boolean> {
  try {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API is unavailable");
    }
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error("Failed to copy to the clipboard", error);
    toast.error("ההעתקה נכשלה");
    return false;
  }

  toast.success(copiedMessage, { description });
  return true;
}
