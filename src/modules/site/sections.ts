import type { ComponentType } from "react";
import type { SectionKey } from "@/modules/tenants";
import { Events } from "@/sections/events/Events";
import { Footer } from "@/sections/footer/Footer";
import { Gallery } from "@/sections/gallery/Gallery";
import { Hero } from "@/sections/hero/Hero";
import { Inside } from "@/sections/inside/Inside";
import { Packages } from "@/sections/packages/Packages";
import { Stage } from "@/sections/stage/Stage";
import type { SectionProps } from "@/sections/types";

/** Section key -> component. Made total in Task 8; a key with no entry renders nothing. */
export const SECTION_COMPONENTS: Partial<Record<SectionKey, ComponentType<SectionProps>>> = {
  hero: Hero,
  inside: Inside,
  stage: Stage,
  gallery: Gallery,
  events: Events,
  packages: Packages,
  footer: Footer,
};
