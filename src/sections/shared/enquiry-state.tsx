"use client";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type PackagePick = { eventSlug: string; name: string; pricePerGuestPaisa: number; minGuests: number };

type Enquiry = {
  eventSlug: string | null;
  /** Belongs in the message only while `pick.eventSlug === eventSlug`, so changing the event later drops it. */
  pick: PackagePick | null;
  guests: number | null;
  chooseEvent: (slug: string) => void;
  choosePackage: (p: PackagePick) => void;
};

const EnquiryContext = createContext<Enquiry | null>(null);

/** Shared enquiry choices: Events and Packages write them, the contact form reads them. */
export function EnquiryProvider({ children }: { children: ReactNode }) {
  const [eventSlug, chooseEvent] = useState<string | null>(null);
  const [pick, setPick] = useState<PackagePick | null>(null);
  const [guests, setGuests] = useState<number | null>(null);

  const value = useMemo<Enquiry>(
    () => ({
      eventSlug,
      pick,
      guests,
      chooseEvent,
      choosePackage: (p) => {
        chooseEvent(p.eventSlug);
        setPick(p);
        setGuests((g) => (g === null || g < p.minGuests ? p.minGuests : g));
      },
    }),
    [eventSlug, pick, guests],
  );
  return <EnquiryContext value={value}>{children}</EnquiryContext>;
}

export function useEnquiry(): Enquiry {
  const value = useContext(EnquiryContext);
  if (!value) throw new Error("useEnquiry needs an EnquiryProvider");
  return value;
}
