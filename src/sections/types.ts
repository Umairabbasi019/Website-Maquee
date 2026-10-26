import type { PublicCatalogue } from "@/modules/catalogue";
import type { MediaView } from "@/modules/media";
import type { SectionKey, SiteContent, TenantSettings } from "@/modules/tenants";

export type SiteView = {
  tenantId: string;
  name: string;
  status: "setup" | "live";
  content: SiteContent;
  theme: TenantSettings["theme"];
  media: Record<string, MediaView>;
  catalogue: PublicCatalogue;
  contact: {
    phone?: string;
    whatsapp?: string;
    hours: TenantSettings["identity"]["openingHours"];
    timeZone: string;
    address?: string;
    map?: { lat: number; lng: number };
    instagram?: string;
  };
  slots: string[];
  /** Visible sections, in settings order. */
  sections: SectionKey[];
  navLinks: { href: string; label: string }[];
  /** Set only by the on-page editor: sections then carry `data-edit` markers. */
  editing?: true;
};

export type SectionProps = { site: SiteView };
