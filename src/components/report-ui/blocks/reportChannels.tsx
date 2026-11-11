import type { ReactNode } from "react";
import { FacebookMark, GoogleMark } from "@/components/brand/brandMarks";
import type { ReportChannel } from "../data/reportData";

/** Each ads channel's name and mark in a report. */
export const REPORT_CHANNEL_LABELS: Record<
  ReportChannel,
  { name: string; mark: ReactNode }
> = {
  facebook: {
    name: "Meta",
    mark: <FacebookMark className="h-4 w-4 text-foreground" />,
  },
  google_ads: {
    name: "Google",
    mark: <GoogleMark className="h-4 w-4 text-foreground" />,
  },
};
