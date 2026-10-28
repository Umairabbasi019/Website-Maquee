import type { Metadata } from "next";
import type { SiteView } from "@/sections/types";

const imageUrl = (view: SiteView) => {
  const urls = view.media[view.content.seo.image]?.urls;
  return urls?.m ?? urls?.s ?? urls?.l;
};

// Sample copy and prices must never be indexed as the venue's real offer.
export const indexable = (view: SiteView): boolean => !(view.status === "setup" || view.content.sample || view.catalogue.hasSample);

export function siteMetadata(view: SiteView, primaryHost: string): Metadata {
  const { title, description } = view.content.seo;
  const url = `https://${primaryHost}/`;
  const image = imageUrl(view);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: image ? [image] : undefined },
    robots: { index: indexable(view) },
  };
}

export function eventVenueJsonLd(view: SiteView, primaryHost: string) {
  const { phone, address, map } = view.contact;
  const image = imageUrl(view);
  return {
    "@context": "https://schema.org",
    "@type": "EventVenue",
    name: view.name,
    url: `https://${primaryHost}/`,
    ...(image && { image }),
    ...(phone && { telephone: phone }),
    ...(address && { address: { "@type": "PostalAddress", streetAddress: address } }),
    ...(map && { geo: { "@type": "GeoCoordinates", latitude: map.lat, longitude: map.lng } }),
  };
}
