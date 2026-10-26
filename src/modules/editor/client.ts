// Client-safe entry: pure code only, nothing that imports "server-only" (index.ts is the server entry).
export { itemKey, type DraftChange } from "./changes";
export { fieldKey } from "./keys";
export { targetKeys, visibleTargets } from "./targets";
