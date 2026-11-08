import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dispatch, SetStateAction } from "react";
import { useSignIn } from "./useSignIn";
import { GoogleSignInButton } from "./GoogleSignInButton";

import type { NavigateToApp, PasswordSignInAttempt } from "../types";

type Props = {
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  onResetPassword: () => void;
  onPasswordSignInStart: () => PasswordSignInAttempt;
  navigateToApp: NavigateToApp;
};

/** Keep sign-in drafts and mutation state within the sign-in screen. */
export function SignInForm({
  email,
  setEmail,
  onResetPassword,
  onPasswordSignInStart,
  navigateToApp,
}: Props) {
  const {
    loading,
    password,
    setPassword,
    handleSignIn,
    handleGoogleSignIn,
    credentialError,
    clearCredentialError,
  } = useSignIn({ email, navigateToApp, onPasswordSignInStart });

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email-signin">אימייל</Label>
        <Input
          id="email-signin"
          type="email"
          value={email}
          onChange={(e) => {
            clearCredentialError();
            setEmail(e.target.value);
          }}
          aria-invalid={credentialError || undefined}
          aria-describedby={credentialError ? "signin-error" : undefined}
          required
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password-signin">סיסמה</Label>
        <Input
          id="password-signin"
          type="password"
          value={password}
          onChange={(e) => {
            clearCredentialError();
            setPassword(e.target.value);
          }}
          aria-invalid={credentialError || undefined}
          aria-describedby={credentialError ? "signin-error" : undefined}
          required
          disabled={loading}
        />
      </div>

      {credentialError && (
        <p id="signin-error" role="alert" className="text-sm text-destructive">
          האימייל או הסיסמה שגויים. נסה שוב.
        </p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "מתחבר..." : "התחבר"}
      </Button>

      <GoogleSignInButton loading={loading} onClick={handleGoogleSignIn} />

      <Button
        type="button"
        variant="link"
        className="w-full text-sm"
        onClick={onResetPassword}
      >
        שכחתי סיסמה
      </Button>
    </form>
  );
}
