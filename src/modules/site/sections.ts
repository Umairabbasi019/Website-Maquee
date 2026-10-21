import type { ComponentType } from "react";
import type { SectionKey } from "@/modules/tenants";
import { Footer } from "@/sections/footer/Footer";
import type { SectionProps } from "@/sections/types";

/** Section key -> component. Made total in Task 8; a key with no entry renders nothing. */
export const SECTION_COMPONENTS: Partial<Record<SectionKey, ComponentType<SectionProps>>> = {
  footer: Footer,
};
