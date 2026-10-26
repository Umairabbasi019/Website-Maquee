export type OpeningHours = { day: number; open: string; close: string }[];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function clockIn(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return { day: DAYS.indexOf(get("weekday")), min: Number(get("hour")) * 60 + Number(get("minute")) };
}

function label(hhmm: string): string {
  const m = minutes(hhmm);
  const h = Math.floor(m / 60) % 12 || 12;
  const mm = m % 60;
  return `${h}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${m < 720 ? "AM" : "PM"}`;
}

export function openStatus(hours: OpeningHours, timeZone: string, now: Date): { open: boolean; opensAt: string | null } {
  const { day, min } = clockIn(timeZone, now);
  const yesterday = (day + 6) % 7;
  const open = hours.some((h) => {
    const o = minutes(h.open);
    const c = minutes(h.close);
    if (h.day === day && (c > o ? min >= o && min < c : min >= o)) return true;
    // A close at or before the open means the window runs past midnight into the next day.
    return h.day === yesterday && c <= o && min < c;
  });
  if (open) return { open, opensAt: null };
  for (let ahead = 0; ahead <= 7; ahead++) {
    const starts = hours
      .filter((h) => h.day === (day + ahead) % 7 && (ahead > 0 || minutes(h.open) > min))
      .sort((a, b) => minutes(a.open) - minutes(b.open));
    // Today and tomorrow read fine as a bare time after "Closed now"; further out needs the weekday.
    if (starts.length) return { open, opensAt: `${ahead > 1 ? `${DAYS[(day + ahead) % 7]} ` : ""}${label(starts[0].open)}` };
  }
  return { open, opensAt: null };
}

export function todayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
