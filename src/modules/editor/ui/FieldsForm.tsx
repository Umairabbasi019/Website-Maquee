"use client";
import type { MediaView } from "@/modules/media/client";
import { t, type TranslationKey } from "@/ui/i18n";
import { en } from "@/ui/i18n/en";
import { CheckField, ListField, MediaField, TextField, type Errors, type Upload } from "./fields";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);

/** The field's label from en.ts (`field.<name>`) when there is one, else the field name itself. */
function labelFor(name: string): string {
  const key = `field.${name}`;
  return Object.hasOwn(en, key) ? t(key as TranslationKey) : name;
}

type Ctx = { media: MediaView[]; upload?: Upload; errors: Errors };

/**
 * A form for any settings object, built from the shape of the value it is given: text, number, checkbox, a list of
 * texts, a photo (an object with a `key`, plus its `focus` when set) and nested groups. `path` prefixes error keys.
 * shortcut: optional fields absent from the venue's content cannot be added here; add a typed panel when the super admin needs one.
 */
export function FieldsForm({
  value,
  onChange,
  media = [],
  upload,
  errors = {},
  path = "",
}: {
  value: Obj;
  onChange: (value: Obj) => void;
  media?: MediaView[];
  upload?: Upload;
  errors?: Errors;
  path?: string;
}) {
  const ctx = { media, upload, errors };
  return Object.entries(value).map(([name, v]) => (
    <Node key={name} label={labelFor(name)} value={v} path={path ? `${path}.${name}` : name} ctx={ctx} onChange={(next) => onChange({ ...value, [name]: next })} />
  ));
}

function Node({ label, value, path, ctx, onChange }: { label: string; value: unknown; path: string; ctx: Ctx; onChange: (v: unknown) => void }) {
  const error = ctx.errors[path];
  if (typeof value === "string") return <TextField label={label} value={value} onChange={onChange} error={error} />;
  if (typeof value === "number")
    return <TextField label={label} type="number" value={String(value)} onChange={(s) => onChange(s.trim() === "" ? NaN : Number(s))} error={error} />;
  if (typeof value === "boolean") return <CheckField label={label} checked={value} onChange={onChange} />;
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((x) => typeof x === "string")) {
      return (
        <ListField label={label} itemLabel={label} addLabel={t("fields.add", { label })} items={value} onChange={onChange} errors={ctx.errors} path={path} />
      );
    }
    return value.map((item, i) => (
      <Node key={i} label={`${label} ${i + 1}`} value={item} path={`${path}.${i}`} ctx={ctx} onChange={(next) => onChange(value.map((x, j) => (j === i ? next : x)))} />
    ));
  }
  if (!isObj(value)) return null;
  const { key, ...rest } = value;
  return (
    <fieldset className="space-y-4 rounded-md border border-muted/40 p-3">
      <legend className="px-1 font-medium">{label}</legend>
      {typeof key === "string" && (
        <MediaField
          label={t("field.photo", { n: 1 })}
          keys={key ? [key] : []}
          max={1}
          media={ctx.media}
          upload={ctx.upload}
          onChange={(update) => onChange({ ...value, key: update(key ? [key] : [])[0] ?? "" })}
          error={ctx.errors[`${path}.key`]}
        />
      )}
      <FieldsForm
        value={typeof key === "string" ? rest : value}
        onChange={(next) => onChange(typeof key === "string" ? { key, ...next } : next)}
        media={ctx.media}
        upload={ctx.upload}
        errors={ctx.errors}
        path={path}
      />
    </fieldset>
  );
}
