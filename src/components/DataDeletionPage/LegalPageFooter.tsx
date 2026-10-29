import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function LegalPageFooter() {
  return (
    <>
      <div className="text-sm text-muted-foreground mt-8 pt-4 border-t">
        עדכון אחרון: {new Date().toLocaleDateString("he-IL")}
      </div>
      <div className="flex items-center justify-between pt-6 border-t">
        <Link
          to="/"
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
    </>
  );
}
