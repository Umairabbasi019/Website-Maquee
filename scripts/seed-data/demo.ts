import type { SiteContent } from "@/modules/tenants";

// Neutral placeholder copy for new venues and the Demo Hall tenant: no real venue names or facts.
// Media keys name the generated demo images.
export const demoContent: SiteContent = {
  sample: true,
  seo: {
    title: "Demo Hall",
    description: "A sample venue page. Replace this text with a short description of your hall.",
    image: "demo-front",
  },
  nav: {
    brand: "DEMO HALL",
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
    front: { key: "demo-front" },
    hall: { key: "demo-hall" },
    captions: {
      arrival: {
        chapter: "Welcome",
        lines: ["A hall for", "*your day*"],
        body: "Sample text. Tell guests what makes your venue worth the visit.",
        primaryCta: "Check a date",
        secondaryCta: "Take the tour",
      },
      doors: { chapter: "The doors", lines: ["Step *inside*"] },
      hall: { chapter: "The hall", lines: ["Room for", "*everyone*"] },
    },
  },
  inside: {
    chapter: "Inside",
    title: ["Walk the *hall*"],
    rooms: [
      { media: { key: "demo-room-1" }, chapter: "Entrance", lines: ["A warm *welcome*"] },
      { media: { key: "demo-room-2" }, chapter: "Main hall", lines: ["Space to *celebrate*"] },
      { media: { key: "demo-room-3" }, chapter: "Lounge", lines: ["Room to *relax*"] },
    ],
  },
  stage: {
    background: { key: "demo-room-3" },
    reveal: { key: "demo-stage" },
    caption: { chapter: "The stage", lines: ["Your moment,", "*centre stage*"], body: "Sample text about your stage." },
  },
  gallery: {
    chapter: "Gallery",
    lines: ["Real events,", "*right here*"],
    tiles: [
      { key: "demo-tile-1", ratio: 0.8 },
      { key: "demo-tile-2", ratio: 1.6 },
      { key: "demo-tile-3", ratio: 0.67 },
      { key: "demo-tile-4", ratio: 1.5 },
      { key: "demo-tile-5", ratio: 0.8 },
      { key: "demo-tile-6", ratio: 1.6 },
    ],
  },
  events: { chapter: "Every celebration", checkCta: "Check a {event} date", packagesCta: "See packages" },
  packages: {
    chapter: "Menus and packages",
    lines: ["Clear prices.", "*No surprises.*"],
    lead: "Per-guest price, full menu upfront. Pick one, add extras when you book.",
    fine: "Final quote confirms tax and any date-based pricing. Nothing is charged until you confirm.",
    background: { key: "demo-room-3" },
  },
  contact: {
    media: { key: "demo-room-2" },
    lines: ["Plan it", "*with us*"],
    lead: "Pick a date, event and guest count. Your message reaches the events manager on WhatsApp, already written.",
    greeting: "Assalam o Alaikum, I'd like to check availability.",
    otherEvent: "Other",
    guests: { min: 50, max: 1000, step: 25, default: 300 },
    manager: { name: "Our team", role: "events manager", replyNote: "Replies during opening hours" },
    sendCta: "WhatsApp this to {name}",
    callCta: "Call {phone}",
    compareLink: "Or compare packages first",
    openText: "Open now · WhatsApp replies soon",
    closedText: "Closed now · opens {time}, leave a WhatsApp message",
    map: { title: "Find us", place: "Sample address", facts: [], directionsCta: "Get directions" },
  },
  footer: { line: "Demo Hall", copyright: "© 2026 Demo Hall", mark: "Demo Hall" },
};
