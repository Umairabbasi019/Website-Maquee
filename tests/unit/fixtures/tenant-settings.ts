import type { TenantSettings } from "@/modules/tenants";

const keys = ["hero", "inside", "stage", "gallery", "events", "packages", "contact", "footer"] as const;

export const defaultSettings: TenantSettings = {
  identity: {
    name: "The Manor",
    tagline: "Not just a venue, but an experience",
    phones: ["+920000000000"],
    openingHours: [],
    social: {},
  },
  theme: {
    colors: { primary: "#b8893b", background: "#0b0b0f", text: "#f5efe6" },
    fonts: { heading: "Cormorant Garamond", body: "Inter" },
  },
  sections: keys.map((key) => ({ key, visible: true })),
  moneyRules: {
    currency: "PKR",
    timeZone: "Asia/Karachi",
    taxPercent: 0,
    advancePercent: 50,
    holdHours: 48,
    instantBooking: false,
    paymentMethods: ["bank", "jazzcash", "easypaisa"],
  },
  messaging: { reminderDays: [7, 3, 1], morningSummaryTime: "08:00", marketingCapPerMonth: 4 },
  limits: { loginLimit: 5, managerLimit: 2 },
};
