import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface DeletionStatus {
  confirmation_code: string;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  received: "הבקשה התקבלה וממתינה לטיפול",
  in_progress: "הבקשה בטיפול",
  completed: "המחיקה הושלמה",
};

function DeletionStatusBox({ code }: { code: string }) {
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const baseUrl = import.meta.env.VITE_SUPABASE_URL;
    fetch(
      `${baseUrl}/functions/v1/meta-data-deletion?code=${encodeURIComponent(code)}`,
    )
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        return body as DeletionStatus;
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="bg-muted/50 p-4 rounded-lg border">
      <p className="mb-2">
        <strong>סטטוס בקשת מחיקה</strong>
      </p>
      <p className="mb-1">
        קוד אישור: <code dir="ltr">{code}</code>
      </p>
      {loading && <p>טוען...</p>}
      {!loading && error && (
        <p className="text-destructive">
          לא נמצאה בקשה עם קוד זה ({error}). אם קיבלת את הקוד מ-Facebook, פנה
          אלינו ל-privacy@aios.co.il.
        </p>
      )}
      {!loading && status && (
        <>
          <p>
            סטטוס:{" "}
            <strong>{STATUS_LABELS[status.status] ?? status.status}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            התקבלה ב-{new Date(status.created_at).toLocaleString("he-IL")}
          </p>
        </>
      )}
    </div>
  );
}

export default function DataDeletion() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || null;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="container max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">מחיקת מידע</CardTitle>
            <p className="text-muted-foreground mt-2">
              דף זה מסביר כיצד לבקש מחיקה של המידע ש-AIOS שומרת עבורך
              מאינטגרציות Meta (Facebook, Instagram) ו-Google, ומה קורה לאחר
              הבקשה.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            {code && (
              <section>
                <DeletionStatusBox code={code} />
              </section>
            )}

            <section>
              <h2 className="text-2xl font-semibold mb-3">
                1. איך מבקשים מחיקה
              </h2>
              <ul className="list-disc pr-6 space-y-2">
                <li>
                  <strong>ניתוק האינטגרציה:</strong> היכנס למערכת, עבור אל
                  הגדרות ← אינטגרציות ונתק את החיבור ל-Facebook / Instagram /
                  Google. הניתוק מוחק את אסימוני הגישה (tokens) של החשבון.
                </li>
                <li>
                  <strong>בקשה באימייל:</strong> שלח הודעה לכתובת{" "}
                  <a
                    href="mailto:privacy@aios.co.il"
                    className="text-primary hover:underline"
                  >
                    privacy@aios.co.il
                  </a>{" "}
                  עם כתובת האימייל של חשבון AIOS שלך וציון האינטגרציה שברצונך
                  למחוק. נאשר את קבלת הבקשה ונשלים את המחיקה בהקדם.
                </li>
                <li>
                  <strong>הסרת האפליקציה ב-Facebook:</strong> הסרת AIOS מתוך
                  הגדרות ← אפליקציות ואתרים בחשבון Facebook שלך שולחת אלינו
                  אוטומטית בקשת מחיקה. תקבל קוד אישור וקישור לדף זה למעקב אחר
                  הסטטוס.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">2. מה נמחק</h2>
              <ul className="list-disc pr-6 space-y-2">
                <li>
                  <strong>אסימוני גישה:</strong> אסימוני OAuth של Meta ו-Google
                  ורשימת הדפים / החשבונות המחוברים
                </li>
                <li>
                  <strong>נתונים שהתקבלו מהאינטגרציה:</strong> לידים מטפסי
                  Facebook, הודעות ותגובות, נתוני קמפיינים ודוחות שנשמרו במערכת
                  מתוך החשבון המחובר
                </li>
                <li>
                  <strong>הגדרות האינטגרציה:</strong> מיפויי טפסים, מנויי
                  webhook והעדפות סנכרון
                </li>
              </ul>
              <p className="mt-3">
                מידע שהזנת ידנית למערכת (למשל לקוחות ומשימות שיצרת בעצמך) אינו
                נמחק כחלק מבקשה זו. למחיקת חשבון מלאה פנה אלינו באימייל.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">3. לוחות זמנים</h2>
              <ul className="list-disc pr-6 space-y-2">
                <li>
                  <strong>מחיקה מהמערכת:</strong> הנתונים נמחקים מהמסד הפעיל תוך
                  30 יום מקבלת הבקשה
                </li>
                <li>
                  <strong>נתוני גיבוי:</strong> נשמרים עד 30 יום לאחר מחיקה
                  מהמערכת
                </li>
                <li>
                  <strong>לוגים טכניים:</strong> נשמרים עד 12 חודשים לצורכי
                  אבטחה, ללא תוכן אישי מהאינטגרציה
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mb-3">4. יצירת קשר</h2>
              <div className="bg-muted/50 p-4 rounded-lg">
                <p>
                  אימייל:{" "}
                  <a
                    href="mailto:privacy@aios.co.il"
                    className="text-primary hover:underline"
                  >
                    privacy@aios.co.il
                  </a>
                </p>
                <p>
                  מדיניות פרטיות מלאה:{" "}
                  <Link to="/privacy" className="text-primary hover:underline">
                    /privacy
                  </Link>
                </p>
              </div>
            </section>

            <section dir="ltr" className="text-left">
              <h2 className="text-2xl font-semibold mb-3">
                Data Deletion Instructions (English)
              </h2>
              <p className="mb-2">
                To delete the data AIOS holds from your Meta (Facebook,
                Instagram) or Google integrations:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Disconnect the integration under Settings → Integrations (this
                  removes the stored access tokens), or
                </li>
                <li>
                  Email{" "}
                  <a
                    href="mailto:privacy@aios.co.il"
                    className="text-primary hover:underline"
                  >
                    privacy@aios.co.il
                  </a>{" "}
                  from your AIOS account email, naming the integration to
                  delete.
                </li>
                <li>
                  Removing AIOS from your Facebook apps settings automatically
                  sends us a deletion request; you will receive a confirmation
                  code and a link to this page to check its status.
                </li>
              </ul>
              <p className="mt-3">
                We delete access tokens, integration settings and data imported
                from the connected account within 30 days; backups are retained
                for up to 30 days after deletion.
              </p>
            </section>

            <div className="text-sm text-muted-foreground mt-8 pt-4 border-t">
              עדכון אחרון: {new Date().toLocaleDateString("he-IL")}
            </div>

            {/* Footer Links */}
            <div className="flex items-center justify-between pt-6 border-t">
              <Link
                to="/landing"
                className="text-primary hover:underline flex items-center gap-1"
              >
                <ArrowRight className="h-4 w-4" />
                חזרה לדף הבית
              </Link>
              <div className="flex gap-4">
                <Link to="/privacy" className="text-primary hover:underline">
                  מדיניות פרטיות
                </Link>
                <Link to="/terms" className="text-primary hover:underline">
                  תנאי שימוש
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
