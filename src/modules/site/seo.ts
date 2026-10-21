import type { Metadata } from "next";
import type { SiteView } from "@/sections/types";

const imageUrl = (view: SiteView) => {
  const urls = view.media[view.content.seo.image]?.urls;
  return urls?.m ?? urls?.s ?? urls?.l;
};

export function siteMetadata(view: SiteView, primaryHost: string): Metadata {
  const { title, description } = view.content.seo;
  const url = `https://${primaryHost}/`;
  const image = imageUrl(view);
  // Sample copy and prices must never be indexed as the venue's real offer.
  const noindex = view.status === "setup" || view.content.sample || view.catalogue.hasSample;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, images: image ? [image] : undefined },
    robots: { index: !noindex },
  };
}

export function eventVenueJsonLd(view: SiteView, primaryHost: string) {
  const { phone, address, map } = view.contact;
  const rating = view.content.gallery.rating;
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
    ...(rating && { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.value, reviewCount: rating.count } }),
  };
}
