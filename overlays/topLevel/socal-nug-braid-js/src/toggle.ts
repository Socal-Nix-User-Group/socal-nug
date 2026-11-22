import type { Mode } from "./graph.ts";

/** The slice of `localStorage` this uses. Private browsing throws on both. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MODE_KEY = "origins-mode";

const DEFAULT: Mode = "river";

/**
 * River unless a usable mode was stored. Every access is guarded: private
 * browsing throws on `localStorage`, and boot dying there would leave the
 * page showing only the fallback list.
 */
export function readMode(storage: StorageLike | null): Mode {
  if (storage === null) {
    return DEFAULT;
  }
  try {
    const stored = storage.getItem(MODE_KEY);
    return stored === "river" || stored === "subway" ? stored : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function writeMode(storage: StorageLike | null, mode: Mode): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    // The choice just does not survive this visit. Not worth failing over.
  }
}
