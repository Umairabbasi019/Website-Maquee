import Link from "next/link";
import { t } from "@/ui/i18n";
import type { StaffBookingRow } from "../server/staff";
import { longDate, statusLabel } from "./labels";

type Entry = Pick<StaffBookingRow, "id" | "eventDate" | "slot" | "status" | "customerName">;

// Weeks start on Monday; 2024-01-01 was a Monday.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString("en-PK", { timeZone: "UTC", weekday: "short" }),
);

/**
 * One month as a table with a cell per date; each entry is its slot, status and customer as text, linking to the
 * booking. Below md it reads as a list of the dates that have entries, each with its full date.
 */
export function MonthCalendar({ month, entries, hrefBase }: { month: string; entries: Entry[]; hrefBase: string }) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const caption = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-PK", { timeZone: "UTC", month: "long", year: "numeric" });

  return (
    <>
      <table className="mt-6 w-full table-fixed border-collapse max-md:block">
        <caption className="mb-2 text-left text-xl font-semibold max-md:block">{caption}</caption>
        <thead className="max-md:hidden">
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="p-2 text-left font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="max-md:block">
          {weeks.map((week, w) => (
            <tr key={w} className="max-md:block">
              {week.map((date, i) => {
                const list = date ? entries.filter((e) => e.eventDate === date) : [];
                return (
                  <td
                    key={date ?? `pad-${i}`}
                    className={`h-24 border border-muted/40 p-2 align-top max-md:h-auto max-md:border-x-0 max-md:border-t-0 max-md:px-0 ${list.length ? "max-md:block" : "max-md:hidden"}`}
                  >
                    {date && (
                      <time dateTime={date} className="font-medium">
                        <span className="md:hidden">{longDate(date)}</span>
                        <span className="max-md:hidden">{Number(date.slice(8))}</span>
                      </time>
                    )}
                    {list.length > 0 && (
                      <ul className="mt-1 space-y-1 text-sm">
                        {list.map((e) => (
                          <li key={e.id}>
                            <Link href={`${hrefBase}/${e.id}`} className="block rounded-md underline focus-visible:outline-2 focus-visible:outline-text">
                              <span className="block">{e.slot}</span>
                              <span className="block">{statusLabel(e.status)}</span>
                              <span className="block break-words">{e.customerName}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p className="mt-4">{t("calendar.empty")}</p>}
    </>
  );
}
