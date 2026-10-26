import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteView } from "@/modules/site";
import { SECTION_KEYS } from "@/modules/tenants";
import { Packages } from "@/sections/packages/Packages";
import { Caption } from "@/sections/shared/Caption";
import { EnquiryProvider } from "@/sections/shared/enquiry-state";
import { manorCatalogue, manorContent, manorIdentity, manorMessaging, manorTheme } from "../../scripts/seed-data/manor";
import { defaultSettings } from "./fixtures/tenant-settings";

type Raw = Parameters<typeof buildSiteView>[0];
type Catalogue = Raw["catalogue"];

// Seed prices are rupees; the catalogue holds paisa.
const manor: Catalogue = {
  events: manorCatalogue.events.map(({ packages, ...e }) => ({
    ...e,
    packages: packages.map(({ rupees, featured, ...p }) => ({ ...p, pricePerGuestPaisa: rupees * 100, featured: !!featured })),
  })),
  offers: manorCatalogue.offers,
  hasSample: true,
};

const render = (catalogue: Catalogue, defaultEvent?: string) =>
  renderToStaticMarkup(
    <EnquiryProvider guests={400} maxGuests={1000}>
      <Packages
        site={buildSiteView({
          tenantId: "t1",
          status: "live",
          identity: { ...defaultSettings.identity, ...manorIdentity },
          theme: manorTheme,
          sections: SECTION_KEYS.map((key) => ({ key, visible: true })),
          moneyRules: defaultSettings.moneyRules,
          messaging: { ...defaultSettings.messaging, ...manorMessaging },
          content: { ...manorContent, packages: { ...manorContent.packages, defaultEvent } },
          media: {},
          catalogue,
          slots: ["Lunch", "Dinner"],
        })}
      />
    </EnquiryProvider>,
  );

const tabs = (html: string) => [...html.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)</g)].map((m) => m[1]);

describe("Packages", () => {
  it("gives an event with zero packages no tab", () => {
    const catalogue = { ...manor, events: manor.events.map((e) => (e.slug === "nikkah" ? { ...e, packages: [] } : e)) };
    expect(tabs(render(catalogue))).toEqual(["Mehndi", "Barat", "Valima", "Corporate"]);
  });

  it("renders nothing when no event has packages", () => {
    const catalogue = { ...manor, events: manor.events.map((e) => ({ ...e, packages: [] })) };
    expect(render(catalogue)).toBe("");
  });

  it("selects the default event's tab, else the first", () => {
    expect(render(manor, "barat")).toMatch(/aria-selected="true"[^>]*>Barat</);
    expect(render(manor)).toMatch(/aria-selected="true"[^>]*>Mehndi</);
  });

  it("server-renders every panel with its event name and prices, none hidden by attribute", () => {
    const html = render(manor, "barat");
    const gold = /id="packages-panel-barat"[^>]*>.*?<h4>Gold<\/h4>(.*?)<\/a>/.exec(html)?.[1] ?? "";
    expect(gold).toContain("Rs 4,200");
    expect(gold).toContain("From Rs 12.6 lakh for 300 guests");
    expect(html).not.toMatch(/ hidden[ =>]/);
    expect(html).toContain("Rs 2,600");
    expect(html).toMatch(/id="packages-panel-mehndi"[^>]*>\s*<h3[^>]*>Mehndi<\/h3>/);
    expect(html).toContain("Weekday saver");
  });
  it("wraps a long package name and a 3-line caption instead of widening the page", () => {
    const name = "N".repeat(60);
    const catalogue = { ...manor, events: manor.events.map((e, i) => (i ? e : { ...e, packages: [{ ...e.packages[0], name }] })) };
    expect(render(catalogue)).toContain(`<h4>${name}</h4>`);
    const caption = renderToStaticMarkup(<Caption caption={{ chapter: "C", lines: ["One", "Two", "Three"], body: "B".repeat(60) }} as="h2" />);
    expect(caption).toMatch(/^<div class="cap /);
    // CSS is not applied in this render, so check the rules the card and caption classes carry.
    const rule = (file: string, selector: string) => {
      const css = readFileSync(file, "utf8");
      const start = css.indexOf(`${selector} {`);
      return start >= 0 && css.slice(start, css.indexOf("}", start)).includes("overflow-wrap: anywhere");
    };
    expect(rule("src/sections/packages/packages.module.css", ".pkg")).toBe(true);
    expect(rule("src/modules/site/ui/site-base.css", ".site-root .cap")).toBe(true);
  });
});
