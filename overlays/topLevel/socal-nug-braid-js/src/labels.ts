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

/**
 * Sweep labels apart, then pull any that ended up past an edge back inside.
 *
 * Both steps are needed and both belong here: a label the sweep pushed off the
 * canvas is just as unreadable as one that was never moved, and the renderer
 * and the smoke check have to agree on where labels land or the check is
 * measuring something nobody draws.
 */
export function layoutLabels(
  boxes: readonly AnchoredBox[],
  axis: "x" | "y",
  canvas: { readonly width: number; readonly height: number },
): AnchoredBox[] {
  const anchors = new Map(boxes.map((b) => [b.id, b.anchor]));

  return resolveCollisions(boxes, axis).map((box) => {
    const anchor = anchors.get(box.id)!;
    const half = anchor === "middle" ? box.w / 2 : 0;
    const low = anchor === "end" ? box.w : half;
    const high = anchor === "start" ? box.w : half;
    return {
      ...box,
      anchor,
      x: Math.min(Math.max(box.x, low), Math.max(low, canvas.width - high)),
      y: Math.min(Math.max(box.y, box.h), Math.max(box.h, canvas.height - 2)),
    };
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
