"use client";
import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

export type PackagePick = { eventSlug: string; name: string; pricePerGuestPaisa: number; minGuests: number };

type State = {
  eventSlug: string | null;
  /** Belongs in the message only while `pick.eventSlug === eventSlug`, so changing the event later drops it. */
  pick: PackagePick | null;
  /** The guest count the form shows; the form writes it back on every change. */
  guests: number;
};

type Action = { type: "event"; slug: string } | { type: "package"; pick: PackagePick } | { type: "guests"; guests: number };

export function enquiryReducer(s: State, a: Action): State {
  switch (a.type) {
    case "event":
      return { ...s, eventSlug: a.slug };
    case "package":
      return { eventSlug: a.pick.eventSlug, pick: a.pick, guests: Math.max(s.guests, a.pick.minGuests) };
    case "guests":
      return { ...s, guests: a.guests };
  }
}

type Enquiry = State & {
  chooseEvent: (slug: string) => void;
  choosePackage: (p: PackagePick) => void;
  setGuests: (n: number) => void;
};

const EnquiryContext = createContext<Enquiry | null>(null);

/** Shared enquiry choices: Events and Packages write them, the contact form reads and writes them. */
export function EnquiryProvider({ guests, children }: { guests: number; children: ReactNode }) {
  const [state, dispatch] = useReducer(enquiryReducer, { eventSlug: null, pick: null, guests });

  const value = useMemo<Enquiry>(
    () => ({
      ...state,
      chooseEvent: (slug) => dispatch({ type: "event", slug }),
      choosePackage: (pick) => dispatch({ type: "package", pick }),
      setGuests: (n) => dispatch({ type: "guests", guests: n }),
    }),
    [state],
  );
  return <EnquiryContext value={value}>{children}</EnquiryContext>;
}

export function useEnquiry(): Enquiry {
  const value = useContext(EnquiryContext);
  if (!value) throw new Error("useEnquiry needs an EnquiryProvider");
  return value;
}
