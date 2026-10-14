import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Carmen Marketing OS | מנהלת השיווק והמכירות של העסק שלך",
  description:
    "כרמן מחברת את השיווק, המכירות והניהול למקום אחד: CRM, WhatsApp, דוחות, משימות, דיוור ועוד.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
