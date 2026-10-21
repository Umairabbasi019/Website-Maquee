import type { ComponentProps } from "react";
import { Lines } from "./lines";

type Props = {
  caption: { chapter: string; lines: string[]; body?: string };
  as: "h1" | "h2" | "h3";
  /** Smaller heading scale (`.sub`). */
  sub?: boolean;
} & ComponentProps<"div">;

/** Chapter line, revealed heading and optional body over a photo. Extra children (buttons) go last. */
export function Caption({ caption, as, sub, className, children, ...rest }: Props) {
  return (
    <div className={`cap ${className ?? ""}`} {...rest}>
      <div className="chap fade">{caption.chapter}</div>
      <Lines lines={caption.lines} as={as} className={sub ? "big serif sub" : "big serif"} />
      {caption.body && (
        <p className="fade" style={{ transitionDelay: "0.4s" }}>
          {caption.body}
        </p>
      )}
      {children}
    </div>
  );
}
