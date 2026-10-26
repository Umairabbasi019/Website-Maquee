import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSiteView, eventVenueJsonLd, siteMetadata } from "@/modules/site";
import { SECTION_KEYS } from "@/modules/tenants";
import { Footer } from "@/sections/footer/Footer";
import { Packages } from "@/sections/packages/Packages";
import { EnquiryProvider } from "@/sections/shared/enquiry-state";
import { manorContent, manorIdentity, manorMessaging, manorTheme } from "../../scripts/seed-data/manor";
import { defaultSettings } from "./fixtures/tenant-settings";

type Raw = Parameters<typeof buildSiteView>[0];
const empty: Raw["catalogue"] = { events: [], offers: [], addons: [], stageThemes: [], hasSample: false };

const raw = (over: Partial<Raw> = {}): Raw => ({
  tenantId: "t1",
  status: "live",
  identity: { ...defaultSettings.identity, ...manorIdentity },
  theme: manorTheme,
  sections: SECTION_KEYS.map((key) => ({ key, visible: true })),
  moneyRules: defaultSettings.moneyRules,
  messaging: { ...defaultSettings.messaging, ...manorMessaging },
  content: { ...manorContent, sample: false },
  media: {},
  catalogue: empty,
  slots: ["Lunch", "Dinner"],
  ...over,
});

describe("buildSiteView", () => {
  it("keeps visible sections in settings order and drops nav links to hidden ones", () => {
    const sections = [
      { key: "footer", visible: true },
      { key: "contact", visible: false },
      { key: "hero", visible: true },
      { key: "packages", visible: true },
      { key: "inside", visible: true },
      { key: "stage", visible: true },
      { key: "gallery", visible: true },
      { key: "events", visible: true },
    ] as Raw["sections"];
    const view = buildSiteView(raw({ sections }));
    expect(view.sections).toEqual(["footer", "hero", "packages", "inside", "stage", "gallery", "events"]);
    expect(view.navLinks.map((l) => l.href)).toEqual(["#inside", "#events", "#packages"]);
  });

  it("leaves contact.instagram undefined and the footer without an Instagram link", () => {
    const view = buildSiteView(raw({ identity: { ...raw().identity, social: {} } }));
    expect(view.contact.instagram).toBeUndefined();
    expect(renderToStaticMarkup(<Footer site={view} />)).not.toContain("Instagram");
    expect(renderToStaticMarkup(<Footer site={buildSiteView(raw())} />)).toContain("Instagram");
  });

  it("gives the footer section the id footer and links only visible sections", () => {
    const html = renderToStaticMarkup(<Footer site={buildSiteView(raw())} />);
    expect(html).toContain('id="footer"');
    expect(html).toContain('href="#inside"');
  });
});

describe("edit markers", () => {
  const goldCatalogue: Raw["catalogue"] = {
    ...empty,
    events: [
      {
        id: "e1",
        slug: "barat",
        name: "Barat",
        description: "d",
        mediaKey: null,
        packages: [{ id: "p1", name: "Gold", pricePerGuestPaisa: 420000, minGuests: 300, items: ["Seating"], featured: true }],
      },
    ],
  };
  const site = (editing?: true) => ({ ...buildSiteView(raw({ catalogue: goldCatalogue })), ...(editing && { editing }) });
  const render = (view: ReturnType<typeof site>) =>
    renderToStaticMarkup(
      <EnquiryProvider guests={400} maxGuests={1000}>
        <Packages site={view} />
      </EnquiryProvider>,
    );

  it("marks the Gold card and the section while editing", () => {
    const html = render(site(true));
    expect(html).toContain('data-edit="package:p1"');
    expect(html).toContain('data-edit-label="Edit Gold package"');
    expect(html).toContain('data-edit="package-new:e1"');
    expect(html).toContain('data-edit="section:packages"');
  });

  it("leaves no data-edit attribute in public HTML", () => {
    expect(render(site())).not.toContain("data-edit");
    expect(renderToStaticMarkup(<Footer site={site()} />)).not.toContain("data-edit");
  });
});

describe("siteMetadata", () => {
  it("blocks indexing for sample content", () => {
    const view = buildSiteView(raw({ content: { ...manorContent, sample: true } }));
    expect((siteMetadata(view, "manor.test").robots as { index: boolean }).index).toBe(false);
  });
  it("blocks indexing for sample catalogue rows and setup status", () => {
    const sampleRows = buildSiteView(raw({ catalogue: { ...empty, hasSample: true } }));
    expect((siteMetadata(sampleRows, "manor.test").robots as { index: boolean }).index).toBe(false);
    expect((siteMetadata(buildSiteView(raw({ status: "setup" })), "manor.test").robots as { index: boolean }).index).toBe(false);
  });
  it("allows indexing for a live venue with no samples, with a canonical URL", () => {
    const meta = siteMetadata(buildSiteView(raw()), "manor.test");
    expect((meta.robots as { index: boolean }).index).toBe(true);
    expect(meta.alternates?.canonical).toBe("https://manor.test/");
    expect(meta.title).toBe(manorContent.seo.title);
  });
});

describe("eventVenueJsonLd", () => {
  // A venue's own rating is self-serving review markup, which Google ignores for local businesses.
  it("never marks up the venue's own rating, but includes address and geo when present", () => {
    const ld = eventVenueJsonLd(buildSiteView(raw()), "manor.test");
    expect(ld["@type"]).toBe("EventVenue");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld.geo).toMatchObject({ latitude: 33.6476537 });
    expect(ld.telephone).toBe("+923085021418");
  });
});
