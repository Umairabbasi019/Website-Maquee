import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";

afterEach(() => vi.unstubAllEnvs());

describe("register", () => {
  it("refuses to start a production server without BOOKING_HASH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOOKING_HASH_SECRET", "");
    expect(() => register()).toThrow(/BOOKING_HASH_SECRET/);
  });

  it("lets the production build, a configured server and development start", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOOKING_HASH_SECRET", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(() => register()).not.toThrow();
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("BOOKING_HASH_SECRET", "set");
    expect(() => register()).not.toThrow();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BOOKING_HASH_SECRET", "");
    expect(() => register()).not.toThrow();
  });
});
