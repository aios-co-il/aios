import { Link } from "react-router-dom";
import { PrivacyEmailLink } from "./PrivacyEmailLink";

export function HowToRequestSection() {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3">1. איך מבקשים מחיקה</h2>
      <ul className="list-disc pr-6 space-y-2">
        <li>
          <strong>ניתוק האינטגרציה:</strong> היכנס למערכת, עבור אל הגדרות ←
          אינטגרציות ונתק את החיבור ל-Facebook / Instagram / Google. הניתוק
          מפסיק מיד את השימוש בחשבון, אך פרטי הגישה השמורים והנתונים שיובאו
          נמחקים רק בעת הטיפול בבקשת מחיקה (באימייל או דרך Facebook, כמפורט
          כאן).
        </li>
        <li>
          <strong>בקשה באימייל:</strong> שלח הודעה לכתובת <PrivacyEmailLink />{" "}
          עם כתובת האימייל של חשבון Carmen Marketing OS שלך וציון האינטגרציה
          שברצונך למחוק. נאשר את קבלת הבקשה ונטפל בה ידנית.
        </li>
        <li>
          <strong>הסרת האפליקציה ב-Facebook:</strong> הסרת Carmen Marketing OS
          מתוך הגדרות ← אפליקציות ואתרים בחשבון Facebook שלך שולחת אלינו בקשת
          מחיקה. הבקשה נרשמת אצלנו, ותקבל קוד אישור וקישור לדף זה למעקב אחר
          הסטטוס.
        </li>
      </ul>
    </section>
  );
}

export function WhatIsDeletedSection() {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3">2. מה נמחק</h2>
      <p className="mb-2">
        המחיקה אינה אוטומטית: כל בקשה נרשמת ומטופלת ידנית על ידי הצוות שלנו. בעת
        הטיפול בבקשה נמחקים:
      </p>
      <ul className="list-disc pr-6 space-y-2">
        <li>
          <strong>Access Tokens:</strong> אסימוני OAuth של Meta ו-Google ורשימת
          הדפים / החשבונות המחוברים
        </li>
        <li>
          <strong>נתונים שהתקבלו מהאינטגרציה:</strong> לידים מטפסי Facebook,
          הודעות ותגובות, נתוני קמפיינים ודוחות שנשמרו במערכת מתוך החשבון המחובר
        </li>
        <li>
          <strong>הגדרות האינטגרציה:</strong> מיפויי טפסים, מנויי webhook
          והעדפות סנכרון
        </li>
      </ul>
      <p className="mt-3">
        מידע שהזנת ידנית למערכת (למשל לקוחות ומשימות שיצרת בעצמך) אינו נמחק כחלק
        מבקשה זו. למחיקת חשבון מלאה פנה אלינו באימייל.
      </p>
    </section>
  );
}

export function TimelinesSection() {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3">3. לוחות זמנים</h2>
      <ul className="list-disc pr-6 space-y-2">
        <li>
          <strong>טיפול בבקשה:</strong> הבקשה מטופלת ידנית והנתונים נמחקים מהמסד
          הפעיל תוך 30 יום מקבלתה
        </li>
        <li>
          <strong>נתוני גיבוי:</strong> נשמרים עד 30 יום לאחר מחיקה מהמסד הפעיל
        </li>
        <li>
          <strong>לוגים טכניים:</strong> נשמרים עד 12 חודשים לצורכי אבטחה, ללא
          תוכן אישי מהאינטגרציה
        </li>
      </ul>
    </section>
  );
}

export function ContactSection() {
  return (
    <section>
      <h2 className="text-2xl font-semibold mb-3">4. יצירת קשר</h2>
      <div className="bg-muted/50 p-4 rounded-lg">
        <p>
          <strong>Carmen Marketing OS</strong>
        </p>
        <p>
          אימייל: <PrivacyEmailLink />
        </p>
        <p>
          מדיניות פרטיות מלאה:{" "}
          <Link to="/privacy" className="text-primary hover:underline">
            /privacy
          </Link>
        </p>
      </div>
    </section>
  );
}
