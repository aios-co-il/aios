import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSearchParams } from "react-router-dom";
import { DeletionStatusBox } from "@/components/DataDeletionPage/DeletionStatusBox";
import {
  ContactSection,
  HowToRequestSection,
  TimelinesSection,
  WhatIsDeletedSection,
} from "@/components/DataDeletionPage/HebrewSections";
import { EnglishInstructionsSection } from "@/components/DataDeletionPage/EnglishInstructionsSection";
import { LegalPageFooter } from "@/components/DataDeletionPage/LegalPageFooter";

export default function DataDeletion() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code")?.trim() || null;

  return (
    <main className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
      <div className="container max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <h1 className="text-3xl font-semibold leading-none tracking-tight">
              מחיקת מידע
            </h1>
            <p className="text-muted-foreground mt-2">
              דף זה מסביר כיצד לבקש מחיקה של המידע ש-Carmen Marketing OS שומרת
              עבורך מאינטגרציות Meta (Facebook, Instagram) ו-Google, ומה קורה
              לאחר הבקשה.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            {code && (
              <section>
                <DeletionStatusBox code={code} />
              </section>
            )}
            <HowToRequestSection />
            <WhatIsDeletedSection />
            <TimelinesSection />
            <ContactSection />
            <EnglishInstructionsSection />
            <LegalPageFooter />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
