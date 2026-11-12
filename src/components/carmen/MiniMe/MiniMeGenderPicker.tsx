import { useMiniMeGender } from "@/hooks/useMiniMeGender";
import { cn } from "@/lib/utils";
import { MiniMe } from "./MiniMe";
import { MINI_ME_GENDERS, type MiniMeGender } from "./miniMeGender";

const LABELS: Record<MiniMeGender, string> = { male: "זכר", female: "נקבה" };
const HEADING_ID = "minime-gender-heading";

/** Each user's own choice of the male or female Mini Me set. */
export function MiniMeGenderPicker() {
  const { gender, setGender, saving } = useMiniMeGender();
  return (
    <div className="space-y-2">
      <p id={HEADING_ID} className="font-semibold">
        ה־Mini Me שלי
      </p>
      <p className="text-sm text-muted-foreground">
        כל משתמש בוחר לעצמו את הסט הזכרי או הנקבי.
      </p>
      <div
        role="radiogroup"
        aria-labelledby={HEADING_ID}
        className="flex gap-3"
      >
        {MINI_ME_GENDERS.map((option) => {
          const selected = option === gender;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-disabled={saving}
              onClick={() => !saving && !selected && setGender(option)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-3 transition-shadow hover:shadow-elevation-2",
                selected && "ring-2 ring-primary",
              )}
            >
              <MiniMe gender={option} className="w-14" />
              <span className="text-sm font-medium">{LABELS[option]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
