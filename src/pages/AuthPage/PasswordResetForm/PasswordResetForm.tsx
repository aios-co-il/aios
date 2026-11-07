import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePasswordReset } from "./usePasswordReset";
import type { Dispatch, SetStateAction } from "react";

type Props = {
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  onBack: () => void;
};
/** Collect the shared email and submit a recovery request. */
export function PasswordResetForm({ email, setEmail, onBack }: Props) {
  const { loading, handleResetPassword } = usePasswordReset(email, onBack);
  return (
    <form onSubmit={handleResetPassword} className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground mb-4">
          נשלח לך קישור לאיפוס סיסמה למייל. לחץ על הקישור כדי להגדיר סיסמה חדשה.
        </p>
        <Label htmlFor="email-reset">אימייל</Label>
        <Input
          id="email-reset"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          placeholder="הכנס את כתובת המייל שלך"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "שולח..." : "שלח קישור לאיפוס סיסמה"}
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        חזור להתחברות
      </Button>
    </form>
  );
}
