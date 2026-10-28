import type { Metadata } from "next";
import { getRequestOptions, RequestForm, type RequestFormValues } from "@/modules/booking";
import { indexable, SitePage } from "@/modules/site";
import { formatRs } from "@/sections/shared/format";
import { t } from "@/ui/i18n";
import { estimateBooking, submitBookingRequest } from "./actions";
import { hostSite } from "./host";

// Allowed to block: rendered whole per request, like the home page, so the form works without JavaScript.
export const instant = false;

type Params = Record<string, string | string[] | undefined>;

export async function generateMetadata(): Promise<Metadata> {
  const site = await hostSite();
  return { title: `${t("booking.heading")} | ${site.name}`, robots: { index: indexable(site) } };
}

export default async function BookPage({ searchParams }: { searchParams: Promise<Params> }) {
  const site = await hostSite();
  const [options, params] = await Promise.all([getRequestOptions(site.tenantId), searchParams]);
  const { events, addons } = site.catalogue;

  // The site's "Request booking" links carry the visitor's choices. They only prefill: anything that is not this
  // venue's (or not in range) is left blank, and the action checks everything again.
  const param = (key: string) => (typeof params[key] === "string" ? params[key] : "");
  const pkgEvent = events.find((e) => e.packages.some((p) => p.id === param("package")));
  const event = pkgEvent ?? events.find((e) => e.slug === param("event"));
  const date = param("date");
  const guests = Number(param("guests"));
  const prefill: RequestFormValues = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= options.today && date <= options.lastDay ? date : "",
    slotId: options.slots.find((s) => s.name === param("slot"))?.id ?? "",
    eventTypeId: event?.id ?? "",
    guests: Number.isInteger(guests) && guests > 0 && guests <= options.maxGuests ? String(guests) : "",
    packageId: pkgEvent ? param("package") : "",
    addonIds: [],
    name: "",
    phone: "",
    whatsappConsent: false,
    website: "",
  };

  return (
    <SitePage site={site}>
      <RequestForm
        action={submitBookingRequest}
        estimate={options.showEstimate ? estimateBooking : undefined}
        events={events.map((e) => ({ id: e.id, name: e.name, packages: e.packages.map((p) => ({ id: p.id, name: p.name })) }))}
        addons={addons.map((a) => ({
          id: a.id,
          name: a.name,
          price: a.basis === "per_guest" ? t("packages.addonPerGuest", { price: formatRs(a.pricePaisa) }) : formatRs(a.pricePaisa),
        }))}
        slots={options.slots}
        maxGuests={options.maxGuests}
        today={options.today}
        lastDay={options.lastDay}
        prefill={prefill}
      />
    </SitePage>
  );
}
