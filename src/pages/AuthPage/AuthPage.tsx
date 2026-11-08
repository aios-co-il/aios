import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthShell } from "./AuthShell/AuthShell";
import { SignInForm } from "./SignInForm/SignInForm";
import { MfaForm } from "./MfaForm/MfaForm";
import { PasswordResetForm } from "./PasswordResetForm/PasswordResetForm";
import { PasswordSetupForm } from "./PasswordSetupForm/PasswordSetupForm";
import { useAuthNavigation } from "./useAuthNavigation/useAuthNavigation";
import { useAuthSession } from "./useAuthSession";
import { useInvitationDetails } from "./useInvitationDetails";
import { useMfa } from "./useMfa/useMfa";
import { parseAuthType } from "./types";

/** Compose local forms and shared session transitions. */
export default function AuthPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resetMode, setResetMode] = useState(false);
  const { navigateToApp, cancelPending } = useAuthNavigation();
  const { email, setEmail, inviteBanner } = useInvitationDetails(
    searchParams.get("token"),
  );
  const mfa = useMfa(navigateToApp);
  const resetMfa = mfa.backToSignIn;

  const resetForms = useCallback(() => {
    cancelPending();
    resetMfa();
    setResetMode(false);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("type");

        return next;
      },
      { replace: true },
    );
  }, [cancelPending, resetMfa, setSearchParams]);

  const session = useAuthSession(searchParams, mfa.completeSignIn, resetForms);
  const { checkingSession, updatePasswordMode } = session;

  if (checkingSession && !updatePasswordMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A1526] p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <AuthShell inviteBanner={inviteBanner} hideInvitation={updatePasswordMode}>
      {updatePasswordMode && !mfa.factorId ? (
        <PasswordSetupForm
          navigateToApp={mfa.completeSignIn}
          authType={parseAuthType(searchParams.get("type"))}
        />
      ) : mfa.factorId ? (
        <MfaForm
          factorId={mfa.factorId}
          navigateToApp={navigateToApp}
          backToSignIn={backToSignIn}
          onVerificationStart={mfa.onVerificationStart}
          onVerificationEnd={mfa.onVerificationEnd}
        />
      ) : resetMode ? (
        <PasswordResetForm
          email={email}
          setEmail={setEmail}
          onBack={() => setResetMode(false)}
        />
      ) : (
        <SignInForm
          email={email}
          setEmail={setEmail}
          onResetPassword={() => setResetMode(true)}
          onPasswordSignInStart={onPasswordSignInStart}
          navigateToApp={mfa.completeSignIn}
        />
      )}
    </AuthShell>
  );

  /** Explicit exit also clears the URL mode so future events cannot restore setup. */
  function backToSignIn() {
    session.exitPasswordSetup();
    resetForms();
  }

  /** A new password attempt supersedes any older bootstrap completion. */
  function onPasswordSignInStart() {
    const attempt = session.onPasswordSignInStart();
    cancelPending();
    resetMfa();

    return attempt;
  }
}
