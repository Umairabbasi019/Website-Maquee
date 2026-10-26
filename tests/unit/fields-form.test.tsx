import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FieldsForm } from "@/modules/editor";
import { en } from "@/ui/i18n/en";

const value = { chapter: "x", lines: ["a", "b"], background: { key: "g3", focus: "50% 50%" } };
const media = [{ key: "g3", alt: "Floral entrance", urls: { s: "https://x/g3/s.jpg" }, widths: {} }];
const html = renderToStaticMarkup(<FieldsForm value={value} onChange={() => {}} media={media} />);
const count = (re: RegExp) => html.match(re)?.length ?? 0;

describe("FieldsForm", () => {
  it("renders the value's own shape: one text input, a two-item list and one photo picker", () => {
    expect(count(/<input [^>]*value="x"/g)).toBe(1);
    expect(html).toContain(`>${en["field.chapter"]}</label>`);
    expect(count(/aria-label="Lines \d"/g)).toBe(2);
    expect(count(new RegExp(`>${en["field.addPhoto"]}</button>`, "g"))).toBe(1);
    // The picked photo shows by its alt text, its focus as its own input.
    expect(html).toContain("Floral entrance");
    expect(count(/<input [^>]*value="50% 50%"/g)).toBe(1);
  });

  it("offers no control to add a field the value does not have", () => {
    const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    expect(new Set(buttons)).toEqual(new Set(["↑", "↓", "✕", en["fields.add"].replace("{label}", "Lines"), en["field.addPhoto"]]));
  });
});
