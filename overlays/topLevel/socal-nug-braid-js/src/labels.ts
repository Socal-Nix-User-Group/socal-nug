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

/** How far a blocked label steps per try, and how many tries it gets. */
const STEP = 4;
const TRIES = 24;

/**
 * Sweep labels apart, pull any that ended up past an edge back inside, then
 * step the ones sitting on an obstacle off it.
 *
 * All three steps belong here: a label the sweep pushed off the canvas is just
 * as unreadable as one that was never moved, a label on top of somebody's face
 * is worse than either, and the renderer and the smoke check have to agree on
 * where labels land or the check is measuring something nobody draws.
 */
export function layoutLabels(
  boxes: readonly AnchoredBox[],
  axis: "x" | "y",
  canvas: { readonly width: number; readonly height: number },
  obstacles: readonly Obstacle[] = [],
): AnchoredBox[] {
  const anchors = new Map(boxes.map((b) => [b.id, b.anchor]));

  const clamp = (box: LabelBox): AnchoredBox => {
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
  };

  const placed = resolveCollisions(boxes, axis).map(clamp);
  if (obstacles.length === 0) return placed;

  // Obstacles are already drawn and cannot move, so a label on one walks along
  // the sweep axis until it is clear. Bounded, and it keeps whatever it has
  // when the canvas edge stops it: a label slightly over a circle beats a
  // label shoved off the page.
  return placed.map((box) => {
    let current = box;
    for (let attempt = 0; attempt < TRIES; attempt += 1) {
      const rect = rectOf(current);
      if (!obstacles.some((o) => hits(rect, o))) break;
      const next = clamp(
        axis === "y"
          ? { ...current, y: current.y + STEP }
          : { ...current, x: current.x + STEP },
      );
      if (next.x === current.x && next.y === current.y) break;
      current = next;
    }
    return current;
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
