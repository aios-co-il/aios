import { CARMEN_CHARACTER } from "@/lib/agentSeats";
import "./carmen-portrait.css";

export function CarmenPortrait({
  image = CARMEN_CHARACTER,
  name = "כרמן",
  custom = false,
  className = "",
}: {
  image?: string;
  name?: string;
  custom?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`carmen-portrait ${custom ? "is-custom" : ""} ${className}`}
      role="img"
      aria-label={name}
    >
      <span className="carmen-portrait-disc" />
      <span className="carmen-portrait-body">
        <img src={image} alt="" />
      </span>
      <span className="carmen-portrait-pop">
        <img src={image} alt="" />
      </span>
    </span>
  );
}
