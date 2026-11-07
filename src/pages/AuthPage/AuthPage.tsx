import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthShell } from "./AuthShell/AuthShell";
import { SignInForm } from "./SignInForm/SignInForm";
import { MfaForm } from "./MfaForm/MfaForm";
import { PasswordResetForm } from "./PasswordResetForm/PasswordResetForm";
import { PasswordSetupForm } from "./PasswordSetupForm/PasswordSetupForm";
import { useAuthNavigation } from "./useAuthNavigation/useAuthNavigation";
import { useAuthSession } from "./useAuthSession";
import { useInvitationContext } from "./useInvitationContext";
import { useMfa } from "./useMfa/useMfa";

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const [resetMode, setResetMode] = useState(false);
  const navigateToApp = useAuthNavigation();
  const { email, setEmail, inviteBanner } = useInvitationContext(
    searchParams.get("token"),
  );
  const mfa = useMfa(navigateToApp);
  const { checkingSession, updatePasswordMode, onPasswordSignInStart } =
    useAuthSession(searchParams, mfa.completeSignIn);
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
          authType={searchParams.get("type")}
        />
      ) : mfa.factorId ? (
        <MfaForm
          factorId={mfa.factorId}
          navigateToApp={navigateToApp}
          backToSignIn={mfa.backToSignIn}
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
}
