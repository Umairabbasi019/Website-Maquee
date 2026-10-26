import { t } from "@/ui/i18n";
import { formatRs } from "./format";

export type EnquiryInput = {
  greeting: string;
  date: string | null;
  event: string;
  slot: string;
  guests: number;
  pkg?: { name: string; pricePerGuestPaisa: number };
  name?: string;
};

function dateLabel(date: string | null): string {
  if (!date) return t("enquiry.dateUndecided");
  return new Date(`${date}T00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function buildEnquiryMessage(i: EnquiryInput): string {
  return [
    i.greeting,
    `${t("enquiry.date")} ${dateLabel(i.date)}`,
    `${t("enquiry.event")} ${i.event} (${i.slot})`,
    `${t("enquiry.guests")} ${i.guests}`,
    i.pkg && `${t("enquiry.package")} ${i.pkg.name} (${formatRs(i.pkg.pricePerGuestPaisa)} ${t("enquiry.perGuest")})`,
    i.name && `${t("enquiry.name")} ${i.name}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function waLink(number: string, text: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}
