import { isIP } from "node:net";

/** Parses a valid IPv6 string into its eight hextets, or null. An embedded dotted IPv4 tail becomes two hextets. */
function hextets(ip: string): number[] | null {
  const dotted = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (dotted) {
    const [a, b, c, d] = dotted[2].split(".").map(Number);
    ip = `${dotted[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail, extra] = ip.split("::");
  if (extra !== undefined) return null;
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - left.length - right.length;
  const all = [...left, ...Array<string>(fill).fill("0"), ...right].map((h) => parseInt(h, 16));
  return all.length === 8 && !all.some(Number.isNaN) ? all : null;
}

/**
 * The rate-limit bucket of a client IP: IPv4 as is, an IPv4-mapped IPv6 as its IPv4, any other IPv6 as its /64
 * (one subscriber holds a whole /64, so hashing the full address would give them unlimited keys).
 * Anything that is not an IP comes back unchanged.
 */
export function ipBucket(ip: string): string {
  const bare = ip.split("%")[0];
  if (isIP(bare) !== 6) return ip;
  const h = hextets(bare);
  if (!h) return ip;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return `${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`;
  return `${h.slice(0, 4).map((x) => x.toString(16)).join(":")}::/64`;
}
