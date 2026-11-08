import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMfaVerification, type MfaVerification } from "./useMfaVerification";

type Props = MfaVerification & { backToSignIn: () => void };

/** Keep verification state local to the active TOTP challenge. */
export function MfaForm({ backToSignIn, ...verification }: Props) {
  const { loading, mfaCode, setMfaCode, handleMFAVerify } =
    useMfaVerification(verification);

  return (
    <form onSubmit={handleMFAVerify} className="space-y-4">
      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold">אימות דו-שלבי</h3>
        <p className="text-sm text-muted-foreground">
          הזן את הקוד בן 6 הספרות מאפליקציית ה-Authenticator שלך
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mfa-code">קוד אימות</Label>
        <Input
          id="mfa-code"
          type="text"
          maxLength={6}
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          className="font-mono text-lg tracking-wider text-center"
          autoComplete="off"
          autoFocus
          disabled={loading}
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={loading || mfaCode.length !== 6}
      >
        {loading ? "מאמת..." : "אמת"}
      </Button>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={backToSignIn}
        disabled={loading}
      >
        חזור להתחברות
      </Button>
    </form>
  );
}
