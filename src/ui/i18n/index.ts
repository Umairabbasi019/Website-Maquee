import { en, type TranslationKey } from "./en";

export type { TranslationKey };

export function t(key: TranslationKey): string {
  return en[key];
}
