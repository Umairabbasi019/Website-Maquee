import type { ComponentType } from "react";
import type { SectionKey } from "@/modules/tenants";
import { Contact } from "@/sections/contact/Contact";
import { Events } from "@/sections/events/Events";
import { Footer } from "@/sections/footer/Footer";
import { Gallery } from "@/sections/gallery/Gallery";
import { Hero } from "@/sections/hero/Hero";
import { Inside } from "@/sections/inside/Inside";
import { Packages } from "@/sections/packages/Packages";
import { Stage } from "@/sections/stage/Stage";
import type { SectionProps } from "@/sections/types";

/** Section key -> component. */
export const SECTION_COMPONENTS: Record<SectionKey, ComponentType<SectionProps>> = {
  hero: Hero,
  inside: Inside,
  stage: Stage,
  gallery: Gallery,
  events: Events,
  packages: Packages,
  contact: Contact,
  footer: Footer,
};
