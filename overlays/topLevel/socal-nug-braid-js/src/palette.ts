/**
 * How many threads can be told apart by colour. Past this, a thread takes the
 * muted slot and identity comes from the face and from highlight on hover,
 * because forty distinguishable hues do not exist.
 */
export const PALETTE_SIZE = 12;

/** Palette slot for the nth thread, or -1 once the palette runs out. */
export function hueFor(index: number): number {
  return index < PALETTE_SIZE ? index : -1;
}
