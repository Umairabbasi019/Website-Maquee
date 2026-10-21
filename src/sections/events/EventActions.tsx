"use client";
import { packageTabId } from "../packages/PackageTabs";
import { useEnquiry } from "../shared/enquiry-state";

type Props = { slug: string; check?: string; packages?: string; className: string };

/** "Check a {event} date" carries the event into the enquiry; "See packages" opens that event's tab. */
export function EventActions({ slug, check, packages, className }: Props) {
  const { chooseEvent } = useEnquiry();
  if (!check && !packages) return null;
  return (
    <div className={className}>
      {check && (
        <a className="pill" href="#contact" onClick={() => chooseEvent(slug)}>
          {check}
        </a>
      )}
      {packages && (
        <a className="pill ghost" href="#packages" onClick={() => document.getElementById(packageTabId(slug))?.click()}>
          {packages}
        </a>
      )}
    </div>
  );
}
