/** Shown when the deletion status cannot be checked right now. */
export function StatusUnavailable() {
  return (
    <p className="text-destructive">
      לא הצלחנו לבדוק את הסטטוס כרגע, נסה שוב מאוחר יותר.
      <br />
      <span dir="ltr">
        We could not check the status right now, please try again later.
      </span>
    </p>
  );
}
