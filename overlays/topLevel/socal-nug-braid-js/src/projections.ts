export type Mode = "river" | "map";

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
  project(t: number, lane: number): readonly [number, number];
  labelAnchor(lane: number): LabelAnchor;
}

const PAD = 40;
const LABEL_GAP = 14;

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
  const step = (free / 2 - PAD) / reach;
  const runway = along - 2 * PAD;

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
      project: (t, lane) => [centre + lane * step, PAD + t * runway],
      labelAnchor: (lane) =>
        lane < 0
          ? { anchor: "end", dx: -LABEL_GAP, dy: 4 }
          : { anchor: "start", dx: LABEL_GAP, dy: 4 },
    };
  }

  return {
    mode,
    viewBox,
    project: (t, lane) => [PAD + t * runway, centre + lane * step],
    labelAnchor: () => ({ anchor: "middle", dx: 0, dy: -LABEL_GAP }),
  };
}
