import { useRef } from "react";
import { FileText, Image as ImageIcon, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ATTACHMENT_ACCEPT,
  formatAttachmentSize,
  isPictureType,
  resolveAttachmentType,
  validateAttachmentFiles,
} from "./attachmentRules";

interface ClientUpdateAttachmentPickerProps {
  files: Array<File>;
  onChange: (files: Array<File>) => void;
  disabled?: boolean;
}

/**
 * The composer's attach button and the files picked for the next entry; a
 * file the bucket would refuse is left out with a Hebrew reason.
 */
export function ClientUpdateAttachmentPicker({
  files,
  onChange,
  disabled = false,
}: ClientUpdateAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  /** Adds the accepted picks and explains each refusal. */
  function addPicked(picked: FileList | null) {
    const { accepted, errors } = validateAttachmentFiles(
      Array.from(picked ?? []),
      files.length,
    );
    errors.forEach((message) => toast.error(message));
    if (accepted.length) {
      onChange([...files, ...accepted]);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        aria-label="בחירת קבצים לצירוף"
        onChange={(event) => addPicked(event.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 bg-card"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="h-3.5 w-3.5" />
        צרף תמונות או מסמכים
      </Button>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="קבצים לצירוף">
          {files.map((file, index) => {
            const Icon = isPictureType(resolveAttachmentType(file) ?? "")
              ? ImageIcon
              : FileText;
            return (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-card px-2 py-1 text-xs"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate max-w-[10rem]">{file.name}</span>
                <span className="text-muted-foreground">
                  {formatAttachmentSize(file.size)}
                </span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  aria-label={`הסר את ${file.name}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange(files.filter((_, other) => other !== index))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
