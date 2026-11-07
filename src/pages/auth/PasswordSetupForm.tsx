import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePasswordSetup } from "./usePasswordSetup";

import type { NavigateToApp } from "./types";

type Props = { navigateToApp: NavigateToApp; authType: string | null };
export function PasswordSetupForm({ navigateToApp, authType }: Props) {
  const {
    loading,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    handleUpdatePassword,
  } = usePasswordSetup(navigateToApp);
  return (
    <form onSubmit={handleUpdatePassword} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {authType === "invite"
          ? "ברוך הבא! הגדר סיסמה כדי להשלים את ההצטרפות."
          : "הגדר סיסמה חדשה לחשבון שלך."}
      </p>
      <div className="space-y-2">
        <Label htmlFor="new-password">סיסמה חדשה</Label>
        <Input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          disabled={loading}
          minLength={6}
          placeholder="לפחות 6 תווים"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">אימות סיסמה</Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={loading}
          minLength={6}
          placeholder="הקלד שוב את הסיסמה"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "מעדכן..." : "הגדר סיסמה"}
      </Button>
    </form>
  );
}
