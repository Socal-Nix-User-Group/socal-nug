/**
 * A label's box and the node it belongs to. `x`/`y` move when labels collide;
 * `anchorX`/`anchorY` never do, so a leader line can always be drawn back to
 * the node the label describes.
 */
export interface LabelBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export type Anchor = "start" | "middle" | "end";

/** A box plus the side its text hangs off, which decides its extent. */
export interface AnchoredBox extends LabelBox {
  readonly anchor: Anchor;
}

const GAP = 2;

/** Leftmost and rightmost pixel a label occupies, given where it is anchored. */
export function extentOf(box: AnchoredBox): readonly [number, number] {
  if (box.anchor === "end") return [box.x - box.w, box.x];
  if (box.anchor === "middle") return [box.x - box.w / 2, box.x + box.w / 2];
  return [box.x, box.x + box.w];
}

/** Ground a label may not land on: a node circle, or somebody's face. */
export interface Obstacle {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Rect = { x: number; y: number; w: number; h: number };

const hits = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The rectangle a label covers, given which side its text hangs off. */
function rectOf(box: AnchoredBox): Rect {
  const [left, right] = extentOf(box);
  return { x: left, y: box.y - box.h, w: right - left, h: box.h };
}

/** The other side of a node. A centred label has no other side to go to. */
const FLIPPED: Record<Anchor, Anchor> = {
  start: "end",
  end: "start",
  middle: "middle",
};

/**
 * Sweep labels apart, pull any that ended up past an edge back inside, then
 * swap the ones sitting on an obstacle to the other side of their node.
 *
 * All three steps belong here: a label the sweep pushed off the canvas is just
 * as unreadable as one that was never moved, a label on top of somebody's face
 * is worse than either, and the renderer and the smoke check have to agree on
 * where labels land or the check is measuring something nobody draws.
 *
 * Swapping sides rather than walking away is the point of the third step. A
 * label that walks until it is clear ends up a long way from the dot it names,
 * which costs more than the overlap it was avoiding. A label on the other side
 * of its own node has not gone anywhere.
 */
export function layoutLabels(
  boxes: readonly AnchoredBox[],
  axis: "x" | "y",
  canvas: { readonly width: number; readonly height: number },
  obstacles: readonly Obstacle[] = [],
): AnchoredBox[] {
  const anchors = new Map(boxes.map((b) => [b.id, b.anchor]));

  const clamp = (box: LabelBox, side?: Anchor): AnchoredBox => {
    const anchor = side ?? anchors.get(box.id)!;
    const half = anchor === "middle" ? box.w / 2 : 0;
    const low = anchor === "end" ? box.w : half;
    const high = anchor === "start" ? box.w : half;
    return {
      ...box,
      anchor,
      x: Math.min(Math.max(box.x, low), Math.max(low, canvas.width - high)),
      y: Math.min(Math.max(box.y, box.h), Math.max(box.h, canvas.height - 2)),
    };
  };

  const placed = resolveCollisions(boxes, axis).map((box) => clamp(box));
  if (obstacles.length === 0) return placed;

  const blocked = (box: AnchoredBox) => {
    const rect = rectOf(box);
    return obstacles.some((o) => hits(rect, o));
  };

  return placed.map((box) => {
    if (!blocked(box)) return box;
    const side = FLIPPED[box.anchor];
    if (side === box.anchor) return box;
    // Mirror about the anchor, so the text hangs off the opposite side of the
    // same node at the same distance from it.
    const flipped = clamp({ ...box, x: 2 * box.anchorX - box.x }, side);
    // A flip the canvas edge had to claw back is not a flip; so is one that
    // lands on something else. Either way the original side is no worse.
    const [left, right] = extentOf(flipped);
    const stayed = left >= 0 && right <= canvas.width;
    return stayed && !blocked(flipped) ? flipped : box;
  });
}

/**
 * Sweep once along one axis and push each box clear of its predecessor.
 * Nothing moves on the other axis, and nothing moves at all when the boxes
 * already clear each other.
 */
export function resolveCollisions(
  boxes: readonly LabelBox[],
  axis: "x" | "y",
): LabelBox[] {
  const extent = axis === "x" ? "w" : "h";

  const sorted = [...boxes].sort(
    (a, b) =>
      a[axis] - b[axis] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

  const placed: LabelBox[] = [];
  let edge = Number.NEGATIVE_INFINITY;

  for (const box of sorted) {
    const start = Math.max(box[axis], edge);
    placed.push(axis === "x" ? { ...box, x: start } : { ...box, y: start });
    edge = start + box[extent] + GAP;
  }

  return placed;
}
