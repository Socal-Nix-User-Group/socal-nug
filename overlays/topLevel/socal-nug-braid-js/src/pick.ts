import type { Point } from "./loom-place.ts";
import type { Story } from "./story.ts";

/** What a reader has picked from a list or the map: one person or one moment. */
export type Pick =
  | { readonly kind: "person"; readonly id: string }
  | { readonly kind: "moment"; readonly id: string };

/** What a click on a card leaves picked: that card, or nothing when it was the pick already. */
export function toggled(current: Pick | null, clicked: Pick): Pick | null {
  return current !== null && current.kind === clicked.kind && current.id === clicked.id
    ? null
    : clicked;
}

/** The slugs of everyone lit while `pick` stands: the person, or whoever was at the moment and not away. */
export function litBy(story: Story, pick: Pick | null): ReadonlySet<string> {
  if (pick === null) return new Set();
  if (pick.kind === "person") return new Set([pick.id]);
  const gathering = story.moments.find((g) => g.moment.id === pick.id);
  return new Set(
    (gathering?.through ?? []).filter((p) => !p.away).map((p) => p.slug),
  );
}

/**
 * Where a box has to be scrolled to for `at`, a point in its content in
 * pixels, to be in the middle of it, held to how far the box can scroll.
 */
export function centred(
  at: Point,
  box: { readonly width: number; readonly height: number },
  reach: Point,
): Point {
  const held = (want: number, most: number) => Math.min(Math.max(want, 0), most);
  return {
    x: held(at.x - box.width / 2, reach.x),
    y: held(at.y - box.height / 2, reach.y),
  };
}

/**
 * How far a list has to scroll along one axis for [start, end] to show
 * inside [viewStart, viewEnd]: 0 when it already does. Something longer than
 * the view is shown from its start.
 */
export function reveal(start: number, end: number, viewStart: number, viewEnd: number): number {
  if (end - start > viewEnd - viewStart || start < viewStart) return start - viewStart;
  if (end > viewEnd) return end - viewEnd;
  return 0;
}
