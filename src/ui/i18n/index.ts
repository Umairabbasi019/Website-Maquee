import { en } from "./en";

export function t(key: keyof typeof en): string {
  return en[key];
}
