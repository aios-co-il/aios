import type { LucideIcon } from "lucide-react";
import { Eye, Lock, Mail, Settings, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeactivateMemberButton } from "./DeactivateMemberButton";
import type { ManagedUser, UsersListProps } from "./userListTypes";

type ActionButtonsProps = Pick<
  UsersListProps,
  "actions" | "canViewAs" | "currentUserId" | "resendPending" | "deletePending"
> & {
  user: ManagedUser;
  /** Icon-only buttons for the table; labelled buttons for mobile cards. */
  compact?: boolean;
};

/** Per-user actions: agencies, permissions, password, view-as, resend invite, deactivate, remove. */
export function UserActionButtons({
  user,
  actions,
  canViewAs,
  currentUserId,
  resendPending,
  deletePending,
  compact = false,
}: ActionButtonsProps) {
  const isSelf = user.id === currentUserId;

  function resendInvite() {
    if (confirm(`האם לשלוח הזמנה מחדש ל-${user.email}?`)) {
      actions.resendInvite(user);
    }
  }

  function deleteUser() {
    if (confirm(`האם להסיר את ${user.email} מהארגון?`)) {
      actions.deleteUser(user);
    }
  }

  return (
    <div className={cn("flex gap-2", !compact && "flex-wrap")}>
      <ActionButton
        icon={Settings}
        label="סוכנויות"
        title="ערוך סוכנויות"
        compact={compact}
        onClick={() => actions.editAgencies(user)}
      />
      <ActionButton
        icon={Lock}
        label="הרשאות"
        title="ערוך הרשאות"
        compact={compact}
        onClick={() => actions.editPermissions(user)}
      />
      <ActionButton
        icon={Shield}
        label="סיסמה"
        title="הגדר סיסמה חדשה"
        compact={compact}
        onClick={() => actions.resetPassword(user)}
      />
      {canViewAs(user) && !isSelf && (
        <ActionButton
          icon={Eye}
          label="צפה בתור"
          title="צפה בתור משתמש זה"
          compact={compact}
          onClick={() => actions.viewAs(user)}
          className="border-warning text-warning hover:bg-warning/10"
        />
      )}
      <ActionButton
        icon={Mail}
        label="שלח מחדש"
        title="שלח הזמנה מחדש"
        compact={compact}
        onClick={resendInvite}
        disabled={resendPending}
      />
      <DeactivateMemberButton
        user={user}
        currentUserId={currentUserId}
        compact={compact}
      />
      {!isSelf && (
        <ActionButton
          icon={Trash2}
          label="מחק"
          title="הסר מהארגון"
          compact={compact}
          onClick={deleteUser}
          disabled={deletePending}
          variant="destructive"
        />
      )}
    </div>
  );
}

/** One action: an icon button with a tooltip title, or an icon plus label. */
function ActionButton({
  icon: Icon,
  label,
  title,
  compact,
  onClick,
  disabled,
  variant = "outline",
  className,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  compact: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: "outline" | "destructive";
  className?: string;
}) {
  return (
    <Button
      variant={variant}
      size={compact ? "icon" : "sm"}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(compact ? "flex-shrink-0" : "flex-1", className)}
    >
      <Icon className={compact ? "h-4 w-4" : "h-3 w-3 ml-1"} />
      {!compact && label}
    </Button>
  );
}
