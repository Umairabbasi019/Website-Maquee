import { describe, expect, it, vi } from "vitest";
import { coverSizes, srcSet } from "@/sections/shared/image";
import { openStatus, todayIn, addDays } from "@/sections/shared/hours";
import { buildEnquiryMessage, waLink } from "@/sections/shared/enquiry";
import { formatRs, lakhFrom, formatLocalPhone, parseRupees } from "@/sections/shared/format";
import { easeToward, subscribeFrame } from "@/sections/shared/motion";

const TZ = "Asia/Karachi";
const manor = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "11:00", close: "21:30" }));

describe("srcSet and coverSizes", () => {
  const media = { key: "k", alt: "a", urls: { s: "/s.jpg", m: "/m.jpg" }, widths: { s: 1280, m: 2400, l: 3200 } };
  it("lists only sizes that have both a URL and a width", () => {
    expect(srcSet(media)).toBe("/s.jpg 1280w, /m.jpg 2400w");
    expect(srcSet({ ...media, widths: {} })).toBeUndefined();
  });
  it("sizes a wide picture by box height and falls back to the box width", () => {
    expect(coverSizes(2.84)).toBe("max(100vw, 284vh)");
    expect(coverSizes(0.8, "27vh", 34)).toBe("max(27vh, 28vh)");
    expect(coverSizes(undefined)).toBe("100vw");
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
  it("names the weekday when the next opening is more than a day away", () => {
    const noThu = manor.filter((h) => h.day !== 4); // 2026-10-21 is a Wednesday, so closed tomorrow
    expect(openStatus(noThu, TZ, new Date("2026-10-21T17:00:00Z")).opensAt).toBe("Fri 11 AM");
    const wedOnly = [{ day: 3, open: "11:00", close: "21:30" }];
    expect(openStatus(wedOnly, TZ, new Date("2026-10-21T17:00:00Z")).opensAt).toBe("Wed 11 AM");
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

describe("parseRupees", () => {
  it("accepts rupees the way people type them", () => {
    expect(parseRupees("Rs 3,200")).toBe(320000);
    expect(parseRupees("3200.5")).toBe(320050);
    expect(parseRupees("3,200.50")).toBe(320050);
    expect(parseRupees(" 3200 ")).toBe(320000);
    expect(parseRupees("20,000,000")).toBe(2_000_000_000);
  });
  it("refuses negative, scientific, over-precise, zero, non-ASCII, empty and too-large input", () => {
    for (const input of ["-5", "1e3", "3.333", "0", "٣٢٠٠", "", "20000000.01", "Rs", "3.", ".5"]) {
      expect(parseRupees(input), input).toBeNull();
    }
  });
});

describe("easeToward", () => {
  it("eases part of the way, then settles exactly on the target and stays there", () => {
    const first = easeToward(0, 1);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.2);
    let p = 0;
    let steps = 0;
    while (p !== 1 && steps < 500) {
      p = easeToward(p, 1);
      steps++;
    }
    expect(p).toBe(1);
    expect(steps).toBeLessThan(200);
    expect(easeToward(p, 1)).toBe(1);
  });
});

describe("subscribeFrame", () => {
  it("keeps the shared visibility listener while any subscriber is left", () => {
    const doc = Object.assign(new EventTarget(), { hidden: true });
    const raf = vi.fn(() => 1);
    vi.stubGlobal("document", doc);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    try {
      const leaveA = subscribeFrame(() => {});
      const leaveB = subscribeFrame(() => {});
      leaveB(); // e.g. the depth layer failing in a background tab
      expect(raf).not.toHaveBeenCalled();
      doc.hidden = false;
      doc.dispatchEvent(new Event("visibilitychange"));
      expect(raf).toHaveBeenCalledTimes(1);
      leaveA();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
