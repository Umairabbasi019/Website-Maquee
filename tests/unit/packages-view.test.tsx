import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteView } from "@/modules/site";
import { SECTION_KEYS } from "@/modules/tenants";
import { Packages } from "@/sections/packages/Packages";
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
    <EnquiryProvider>
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

  it("server-renders every panel with prices, hiding the unselected ones", () => {
    const html = render(manor, "barat");
    const gold = /id="packages-panel-barat"[^>]*>.*?<h3>Gold<\/h3>(.*?)<\/a>/.exec(html)?.[1] ?? "";
    expect(gold).toContain("Rs 4,200");
    expect(gold).toContain("From Rs 12.6 lakh for 300 guests");
    expect(html).toMatch(/id="packages-panel-mehndi"[^>]*hidden/);
    expect(html).toContain("Weekday saver");
  });
});
