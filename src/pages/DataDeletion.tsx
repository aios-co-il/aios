import { DATA_DELETION_PAGE } from "@/pages/legal/legalPages";
import { useLegalPageTitle } from "@/pages/legal/useLegalPageTitle";
import { lazy, Suspense } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useSearchParams } from "react-router-dom";
import {
  ContactSection,
  HowToRequestSection,
  TimelinesSection,
  WhatIsDeletedSection,
} from "@/components/DataDeletionPage/HebrewSections";
import { EnglishInstructionsSection } from "@/components/DataDeletionPage/EnglishInstructionsSection";
import { LegalPageFooter } from "@/components/DataDeletionPage/LegalPageFooter";
import { StatusBoxBoundary } from "@/components/DataDeletionPage/StatusBoxBoundary";

// Loaded only with a status code, so the page also renders without the
// Supabase client when it is written to static HTML at build time.
const DeletionStatusBox = lazy(() =>
  import("@/components/DataDeletionPage/DeletionStatusBox").then((module) => ({
    default: module.DeletionStatusBox,
  })),
);

export default function DataDeletion() {
  useLegalPageTitle(DATA_DELETION_PAGE);

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
              דף זה מסביר כיצד לבקש מחיקה של המידע ש-AIOS שומרת עבורך
              מאינטגרציות Meta (Facebook, Instagram) ו-Google, ומה קורה לאחר
              הבקשה.
            </p>
          </CardHeader>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none space-y-8">
            {code && (
              <section>
                <StatusBoxBoundary>
                  <Suspense fallback={<p role="status">טוען סטטוס בקשה...</p>}>
                    <DeletionStatusBox code={code} />
                  </Suspense>
                </StatusBoxBoundary>
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
