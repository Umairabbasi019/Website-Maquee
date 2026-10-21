import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Lines } from "@/sections/shared/lines";

describe("Lines", () => {
  it("wraps *word* in em inside the line markup", () => {
    const html = renderToStaticMarkup(<Lines lines={["but an *experience*"]} as="h1" />);
    expect(html).toBe('<h1><span class="line"><span>but an <em>experience</em></span></span></h1>');
  });
  it("renders markup text literally", () => {
    const html = renderToStaticMarkup(<Lines lines={["<b>x</b>"]} as="h2" />);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });
});
