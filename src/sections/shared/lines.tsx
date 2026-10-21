import { Fragment } from "react";

type Props = { lines: string[]; as: "h1" | "h2" | "h3" | "p"; className?: string };

// Text only: React escapes everything, so markup in a line renders literally. `*word*` becomes <em>.
function emphasise(line: string) {
  return line.split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? <em key={i}>{part}</em> : <Fragment key={i}>{part}</Fragment>));
}

export function Lines({ lines, as: Tag, className }: Props) {
  return (
    <Tag className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {/* A space between block lines, so the text reads "venue, but" and not "venue,but" (copy, screen readers). */}
          {i > 0 && " "}
          <span className="line">
            <span>{emphasise(line)}</span>
          </span>
        </Fragment>
      ))}
    </Tag>
  );
}
