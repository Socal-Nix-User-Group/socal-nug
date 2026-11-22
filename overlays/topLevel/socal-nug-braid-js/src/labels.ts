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

const GAP = 2;

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
