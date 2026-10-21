import type { SiteContent, TenantSettings } from "@/modules/tenants";

// Copy is verbatim from the approved mockup. sample: true because the manager name and prices are placeholders.
const mapsSearch = "https://www.google.com/maps/search/?api=1&query=The+Manor+Marquee+Islamabad";
const instagram = "https://instagram.com/themanormarquee";
const place = "Marquee Complex, Islamabad Expressway";

export const manorContent: SiteContent = {
  sample: true,
  seo: {
    title: "The Manor Marquee, Islamabad",
    description:
      "A faceted glass facade that glows violet after dark, on Islamabad Expressway. Weddings, mehndi, valima and corporate events.",
    image: "ext-night",
  },
  nav: {
    brand: "THE MANOR",
    cta: "Check a date",
    links: [
      { section: "inside", label: "Inside" },
      { section: "events", label: "Events" },
      { section: "packages", label: "Packages" },
      { section: "contact", label: "Contact" },
    ],
  },
  hero: {
    mode: "photos",
    front: { key: "ext-night", focus: "50% 58%" },
    hall: { key: "wide" },
    captions: {
      arrival: {
        chapter: "The arrival",
        lines: ["Not just a venue,", "but an *experience*"],
        body: "A faceted glass facade that glows violet after dark, on Islamabad Expressway. Scroll, and walk in.",
        primaryCta: "Check a date",
        secondaryCta: "Take the tour",
      },
      doors: { chapter: "The doors", lines: ["Step *inside*"] },
      hall: { chapter: "The hall", lines: ["A thousand lights,", "*one night*"] },
    },
  },
  inside: {
    chapter: "Inside",
    title: ["Walk the *hall*"],
    rooms: [
      { media: { key: "g3", focus: "50% 55%" }, chapter: "Welcome", lines: ["Floral entrance"] },
      { media: { key: "g7", focus: "50% 30%" }, chapter: "Grand hall", lines: ["A sky of *crystal*"] },
      { media: { key: "lounge", focus: "50% 100%" }, chapter: "Lounge", lines: ["Room for *every family*"] },
    ],
  },
  stage: {
    background: { key: "lounge" },
    reveal: { key: "stage" },
    caption: {
      chapter: "The stage",
      lines: ["Your moment,", "*centre stage*"],
      body: "Mughal arch, crystal chandelier and fresh florals. Every event gets its own stage theme.",
    },
  },
  gallery: {
    chapter: "Gallery",
    lines: ["Real events,", "*right here*"],
    followLabel: "Follow @themanormarquee",
    tiles: [
      { key: "ig-mehndi", ratio: 0.8 },
      { key: "w-curtain", ratio: 1.6 },
      { key: "v-wreath", ratio: 0.56 },
      { key: "candles", ratio: 1.5 },
      { key: "ig-redstage", ratio: 0.8 },
      { key: "w-hall", ratio: 1.6 },
      { key: "chandelier", ratio: 0.8 },
      { key: "stage-floral", ratio: 1.5 },
      { key: "lounge", ratio: 0.67 },
      { key: "w-redcarpet", ratio: 1.6 },
      { key: "dining", ratio: 0.67 },
      { key: "v-aisle", ratio: 0.56 },
    ],
    rating: { value: 4.5, count: 829, source: "Google", checkedOn: "2026-10-19", url: mapsSearch },
  },
  events: { chapter: "Every celebration", checkCta: "Check a {event} date", packagesCta: "See packages" },
  packages: {
    chapter: "Menus and packages",
    lines: ["Clear prices.", "*No surprises.*"],
    lead: "Per-guest price, full menu upfront. Pick one, add extras when you book.",
    fine: "Final quote confirms tax and any date-based pricing. Nothing is charged until you confirm.",
    background: { key: "lounge" },
    defaultEvent: "barat",
  },
  contact: {
    media: { key: "dining", focus: "50% 40%" },
    lines: ["Plan it", "*with us*"],
    lead: "Pick a date, event and guest count. Your message reaches the events manager on WhatsApp, already written.",
    greeting: "Assalam o Alaikum, I'd like to check availability.",
    otherEvent: "Other",
    guests: { min: 50, max: 1000, step: 25, default: 400 },
    manager: { name: "Ahmed", role: "events manager", replyNote: "Replies in about 15 minutes, 11 AM to 9:30 PM" },
    sendCta: "WhatsApp this to {name}",
    callCta: "Call {phone}",
    compareLink: "Or compare packages first",
    openText: "Open now in Islamabad · WhatsApp replies in about 15 min",
    closedText: "Closed now · opens {time}, leave a WhatsApp message",
    map: {
      title: "Find us",
      place,
      facts: [
        { label: "Hours", value: "Daily, 11 AM to 9:30 PM" },
        { label: "Parking", value: "On site" },
        { label: "Site visits", value: "Any day, book on WhatsApp" },
        { label: "Sister venues", value: "Noor Mahal, The Noir, Gold Canyon, Grandure" },
      ],
      directionsCta: "Get directions",
    },
  },
  footer: {
    line: `The Manor Marquee · ${place}`,
    copyright: "© 2026 The Manor Marquee",
    mark: "The Manor",
  },
};

export const manorIdentity: Partial<TenantSettings["identity"]> = {
  phones: ["+923085021418"],
  address: place,
  mapLocation: { lat: 33.6476537, lng: 73.1076748 },
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "11:00", close: "21:30" })),
  social: { instagram },
};

export const manorMessaging: Partial<TenantSettings["messaging"]> = { whatsappNumber: "923085021418" };

export const manorTheme: TenantSettings["theme"] = {
  colors: { primary: "#d9bf8c", background: "#0b0405", text: "#f4ece0", muted: "#b3a597", deep: "#5b0f1a" },
  fonts: { heading: "Cormorant Garamond", body: "Inter" },
  logo: "logo",
};
