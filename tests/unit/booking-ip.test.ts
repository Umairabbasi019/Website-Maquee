import { describe, expect, it } from "vitest";
import { ipBucket } from "@/modules/booking";

describe("ipBucket", () => {
  it("gives one bucket to every address in a /64", () => {
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe(ipBucket("2001:db8:1:2::1"));
    expect(ipBucket("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
  });
  it("separates different /64s", () => {
    expect(ipBucket("2001:db8:1:2::1")).not.toBe(ipBucket("2001:db8:1:3::1"));
  });
  it("expands :: compression", () => {
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipBucket("::1")).toBe("0:0:0:0::/64");
    expect(ipBucket("2001:db8:1:2:3:4:5::")).toBe("2001:db8:1:2::/64");
  });
  it("turns an IPv4-mapped address into the IPv4", () => {
    expect(ipBucket("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(ipBucket("::ffff:102:304")).toBe("1.2.3.4");
  });
  it("keeps IPv4 and garbage as given", () => {
    expect(ipBucket("203.0.113.9")).toBe("203.0.113.9");
    expect(ipBucket("unknown")).toBe("unknown");
    expect(ipBucket("1::2::3")).toBe("1::2::3");
  });
});
