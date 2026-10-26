"use client";
import { t } from "@/ui/i18n";
import { TextField, type Errors } from "../fields";
import { SettingsPanel, type SettingsProps } from "../SettingsPanel";

type Form = { name: string; whatsapp: string; lat: string; lng: string; instagram: string; facebook: string; googleReview: string };

// An empty optional field is removed rather than stored as "".
const opt = (s: string) => s.trim() || undefined;

/** Super admin: venue name, WhatsApp number, map location and the social and review links (https only, by the schema). */
export function VenuePanel(p: SettingsProps) {
  const { identity, messaging } = p.draft;
  const initial: Form = {
    name: identity.name,
    whatsapp: messaging.whatsappNumber ?? "",
    lat: identity.mapLocation ? String(identity.mapLocation.lat) : "",
    lng: identity.mapLocation ? String(identity.mapLocation.lng) : "",
    instagram: identity.social.instagram ?? "",
    facebook: identity.social.facebook ?? "",
    googleReview: identity.googleReviewUrl ?? "",
  };
  return (
    <SettingsPanel
      {...p}
      initial={initial}
      toChanges={(f) => {
        const errors: Errors = {};
        const whatsapp = opt(f.whatsapp);
        if (whatsapp && !/^\d{8,15}$/.test(whatsapp)) errors["messaging.whatsappNumber"] = t("editor.error.digits");
        const [lat, lng] = [opt(f.lat), opt(f.lng)];
        if (Boolean(lat) !== Boolean(lng)) errors["identity.mapLocation"] = t("editor.error.latLng");
        return {
          errors,
          changes: [
            { part: "identity", path: ["name"], value: f.name.trim() },
            { part: "messaging", path: ["whatsappNumber"], value: whatsapp },
            // Number("abc") is NaN, which the schema refuses with a message beside the field.
            { part: "identity", path: ["mapLocation"], value: lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined },
            { part: "identity", path: ["social"], value: { instagram: opt(f.instagram), facebook: opt(f.facebook) } },
            { part: "identity", path: ["googleReviewUrl"], value: opt(f.googleReview) },
          ],
        };
      }}
    >
      {({ form, set, errors }) => (
        <>
          <TextField label={t("field.venueName")} value={form.name} onChange={(v) => set("name", v)} error={errors["identity.name"]} />
          <TextField label={t("field.whatsapp")} inputMode="numeric" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} error={errors["messaging.whatsappNumber"]} />
          <TextField
            label={t("field.lat")}
            inputMode="decimal"
            value={form.lat}
            onChange={(v) => set("lat", v)}
            error={errors["identity.mapLocation.lat"] ?? errors["identity.mapLocation"]}
          />
          <TextField label={t("field.lng")} inputMode="decimal" value={form.lng} onChange={(v) => set("lng", v)} error={errors["identity.mapLocation.lng"]} />
          <TextField label={t("field.instagram")} value={form.instagram} onChange={(v) => set("instagram", v)} error={errors["identity.social.instagram"]} />
          <TextField label={t("field.facebook")} value={form.facebook} onChange={(v) => set("facebook", v)} error={errors["identity.social.facebook"]} />
          <TextField label={t("field.googleReview")} value={form.googleReview} onChange={(v) => set("googleReview", v)} error={errors["identity.googleReviewUrl"]} />
        </>
      )}
    </SettingsPanel>
  );
}
