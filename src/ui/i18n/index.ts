import { en, type TranslationKey } from "./en";

export type { TranslationKey };

/** `{name}` placeholders are filled from `vars`; unknown ones stay as written. */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  return en[key].replace(/\{(\w+)\}/g, (token, name: string) => String(vars?.[name] ?? token));
}
