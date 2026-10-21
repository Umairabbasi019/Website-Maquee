import { describe, expect, it } from "vitest";
import { pickImageSize } from "@/sections/shared/image";
import { openStatus, todayIn, addDays } from "@/sections/shared/hours";
import { buildEnquiryMessage, waLink } from "@/sections/shared/enquiry";
import { formatRs, lakhFrom, formatLocalPhone } from "@/sections/shared/format";

const TZ = "Asia/Karachi";
const manor = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "11:00", close: "21:30" }));

describe("pickImageSize", () => {
  it("picks by long side times capped dpr", () => {
    expect(pickImageSize(900, 2, ["s", "m", "l"])).toBe("m");
    expect(pickImageSize(900, 3, ["s", "m", "l"])).toBe("l");
    expect(pickImageSize(1400, 1, ["m", "l"])).toBe("m");
    expect(pickImageSize(3000, 1, ["s"])).toBe("s");
  });
});

describe("openStatus", () => {
  it("is open before closing time", () => {
    expect(openStatus(manor, TZ, new Date("2026-10-21T15:59:00Z"))).toEqual({ open: true, opensAt: null });
  });
  it("is closed after closing with next opening", () => {
    expect(openStatus(manor, TZ, new Date("2026-10-21T16:31:00Z"))).toEqual({ open: false, opensAt: "11 AM" });
    expect(openStatus(manor, TZ, new Date("2026-10-21T19:30:00Z"))).toEqual({ open: false, opensAt: "11 AM" });
  });
  it("treats a close before open as past midnight", () => {
    const night = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "18:00", close: "02:00" }));
    expect(openStatus(night, TZ, new Date("2026-10-21T20:00:00Z")).open).toBe(true); // 01:00 PKT
  });
  it("formats minutes in the opening time", () => {
    const h = [{ day: 3, open: "21:30", close: "23:00" }]; // 2026-10-21 is a Wednesday
    expect(openStatus(h, TZ, new Date("2026-10-21T10:00:00Z")).opensAt).toBe("9:30 PM");
  });
  it("handles no hours", () => {
    expect(openStatus([], TZ, new Date())).toEqual({ open: false, opensAt: null });
  });
});

describe("dates", () => {
  it("uses the venue day", () => {
    expect(todayIn(TZ, new Date("2026-10-21T19:30:00Z"))).toBe("2026-10-22");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("enquiry", () => {
  const d = new Date("2026-12-10T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const base = { greeting: "Assalam o Alaikum, I'd like to check availability.", event: "Barat", slot: "Dinner", guests: 400 };
  it("builds the full message", () => {
    const msg = buildEnquiryMessage({ ...base, date: "2026-12-10", pkg: { name: "Gold", pricePerGuestPaisa: 420000 }, name: "Ayesha" });
    expect(msg).toBe(`${base.greeting}\nDate: ${d}\nEvent: Barat (Dinner)\nGuests: about 400\nPackage: Gold (Rs 4,200 per guest)\nName: Ayesha`);
  });
  it("says not decided without a date", () => {
    expect(buildEnquiryMessage({ ...base, date: null })).toContain("\nDate: not decided\n");
  });
  it("builds a wa.me link from digits only", () => {
    expect(waLink("+92 308 5021418", "a b")).toBe("https://wa.me/923085021418?text=a%20b");
  });
});

describe("format", () => {
  it("formats money and phone", () => {
    expect(formatRs(320000)).toBe("Rs 3,200");
    expect(lakhFrom(420000, 300)).toBe("12.6");
    expect(lakhFrom(320000, 300)).toBe("9.6");
    expect(formatLocalPhone("+923085021418")).toBe("0308 502 1418");
    expect(formatLocalPhone("+14155550123")).toBe("+14155550123");
  });
});
