import type { Box, Point } from "./loom-place.ts";
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

/**
 * The slugs of everyone lit while `pick` stands: the person, or whoever the
 * record confirms at the moment. Someone the record says nothing about is
 * not lit, since nothing says they were there.
 */
export function litBy(story: Story, pick: Pick | null): ReadonlySet<string> {
  if (pick === null) return new Set();
  if (pick.kind === "person") return new Set([pick.id]);
  const gathering = story.moments.find((g) => g.moment.id === pick.id);
  return new Set(
    (gathering?.through ?? []).filter((p) => p.vouched).map((p) => p.slug),
  );
}

/**
 * The slugs of the people through moment `id` the record says nothing about:
 * neither confirmed there nor away. They are left as they were while the
 * moment is lit, neither lit nor stepping back, since nothing says which.
 */
export function unsureAt(story: Story, id: string): ReadonlySet<string> {
  const gathering = story.moments.find((g) => g.moment.id === id);
  return new Set(
    (gathering?.through ?? []).filter((p) => !p.vouched && !p.away).map((p) => p.slug),
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
 * Where a list has to be scrolled to for `card`, a card's box in the list's
 * content in pixels, to sit in the middle of the list's box, held to how far
 * the list can scroll. A card longer than the box along an axis is put at the
 * box's start on that axis instead: a card is read from its start, and
 * centred it would lose both ends.
 */
export function framed(
  card: Box,
  box: { readonly width: number; readonly height: number },
  reach: Point,
): Point {
  return centred(
    {
      x: card.x + Math.min(card.width, box.width) / 2,
      y: card.y + Math.min(card.height, box.height) / 2,
    },
    box,
    reach,
  );
}
