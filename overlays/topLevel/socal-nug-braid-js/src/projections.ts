export type Mode = "river" | "subway";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface LabelAnchor {
  readonly anchor: "start" | "middle" | "end";
  readonly dx: number;
  readonly dy: number;
}

/**
 * One layout, two readings of it. The engine produces `(t, lane)`; a
 * projection decides which of those runs down the page and which runs across.
 * Everything else about the two modes is the same picture.
 */
export interface Projection {
  readonly mode: Mode;
  readonly viewBox: readonly [number, number, number, number];
  /** False when the free axis is too narrow to fit a label beside a node. */
  readonly showLabels: boolean;
  project(t: number, lane: number): readonly [number, number];
  labelAnchor(lane: number): LabelAnchor;
}

const PAD = 40;
/**
 * Headroom at the start of the time axis. A thread's root avatar sits back
 * from its first moment, so without this the earliest avatar is clipped by the
 * edge of the canvas.
 */
const LEAD = 76;
const LABEL_GAP = 14;
/** Must match render.ts's LABEL_WIDTH; it is what a label claims beside a node. */
const LABEL_RESERVE = 150;
/** Below this the lanes would have no room left, so labels are dropped. */
const LABEL_MIN_FREE = 460;
const MIN_STEP = 16;

export function projectionFor(
  mode: Mode,
  viewport: Viewport,
  laneRange: readonly [number, number],
): Projection {
  const free = mode === "river" ? viewport.width : viewport.height;
  const along = mode === "river" ? viewport.height : viewport.width;

  const centre = free / 2;
  // Lane 0 is centred, so the furthest lane in either direction decides the
  // step. laneRange has to include excursion lanes or they land off canvas.
  const reach = Math.max(1, -laneRange[0], laneRange[1]);
  const showLabels = free >= LABEL_MIN_FREE;

  // River hangs labels off the side of a node, along the same axis the lanes
  // run on. Without reserving their width the outermost lane sits exactly at
  // PAD and every label on it runs off the edge. Map stacks labels across the
  // time axis instead, so its lanes need no reserve.
  const reserve = mode === "river" && showLabels ? LABEL_RESERVE + LABEL_GAP : 0;
  const step = Math.max(MIN_STEP, (free / 2 - PAD - reserve) / reach);
  const runway = along - LEAD - PAD;

  const viewBox: readonly [number, number, number, number] = [
    0,
    0,
    viewport.width,
    viewport.height,
  ];

  if (mode === "river") {
    return {
      mode,
      viewBox,
      showLabels,
      project: (t, lane) => [centre + lane * step, LEAD + t * runway],
      // Trunk labels go left, into the space the pre-convergence threads have
      // vacated by then. Sending them right put them under the avatars of
      // people arriving on the joiner lanes.
      labelAnchor: (lane) =>
        lane <= 0
          ? { anchor: "end", dx: -LABEL_GAP, dy: 4 }
          : { anchor: "start", dx: LABEL_GAP, dy: 4 },
    };
  }

  return {
    mode,
    viewBox,
    showLabels,
    project: (t, lane) => [LEAD + t * runway, centre + lane * step],
    labelAnchor: () => ({ anchor: "middle", dx: 0, dy: -LABEL_GAP }),
  };
}
