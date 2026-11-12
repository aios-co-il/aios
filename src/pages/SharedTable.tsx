import { useParams } from "react-router-dom";
import { SharedTableReport } from "@/components/SharedTable/SharedTableReport";

/** The /shared/table/:shareToken route: one report as its share link shows it. */
export default function SharedTable() {
  const { shareToken } = useParams();
  return shareToken ? <SharedTableReport shareToken={shareToken} /> : null;
}
