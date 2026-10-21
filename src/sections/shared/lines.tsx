import { Fragment } from "react";

type Props = { lines: string[]; as: "h1" | "h2" | "p" };

// Text only: React escapes everything, so markup in a line renders literally. `*word*` becomes <em>.
function emphasise(line: string) {
  return line.split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? <em key={i}>{part}</em> : <Fragment key={i}>{part}</Fragment>));
}

export function Lines({ lines, as: Tag }: Props) {
  return (
    <Tag>
      {lines.map((line, i) => (
        <span className="line" key={i}>
          <span>{emphasise(line)}</span>
        </span>
      ))}
    </Tag>
  );
}
