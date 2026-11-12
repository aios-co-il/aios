/**
 * The multipart body for Green API's sendFileByUpload (AIO-577). Green API
 * reads the file part's filename header with the wrong encoding, so a Hebrew
 * name arrived garbled; the explicit `fileName` text field is plain UTF-8.
 */
export function greenUploadForm(input: {
  chatId: string;
  file: Blob;
  fileName: string;
  caption?: string | null;
}): FormData {
  const form = new FormData();
  form.append("chatId", input.chatId);
  form.append("file", input.file, input.fileName);
  form.append("fileName", input.fileName);
  if (input.caption) {
    form.append("caption", input.caption);
  }
  return form;
}
