import { graphFor, rootSlug } from "./graph.ts";
import type {
  BraidGraph,
  EdgeMeta,
  ElkGraph,
  ElkNode,
  ElkPoint,
  Mode,
} from "./graph.ts";
import type { Braid } from "./types.ts";

/**
 * What ELK decided, in the shape the renderer draws from.
 *
 * ELK hands back boxes and edge sections in its own coordinates. This turns
 * them into centres for dots and faces, anchor points for labels, and a
 * polyline per edge with the meta that says what the edge is. The layout
 * itself is injected: the page gives the real ELK, the smoke check gives it
 * too, and the unit tests give a fake shaped like one.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PlacedLabel {
  readonly x: number;
  readonly y: number;
  readonly anchor: "end" | "middle";
  /** What the layout made room for, which is not always the whole title. */
  readonly text: string;
}

export interface PlacedEdge {
  readonly meta: EdgeMeta;
  readonly points: readonly Point[];
}

export interface Placed {
  readonly mode: Mode;
  readonly width: number;
  readonly height: number;
  readonly moments: ReadonlyMap<string, Point>;
  readonly roots: ReadonlyMap<string, Point>;
  readonly labels: ReadonlyMap<string, PlacedLabel>;
  readonly edges: readonly PlacedEdge[];
}

export type Layout = (graph: ElkGraph) => Promise<ElkGraph>;

/** Where a label's text hangs from: its baseline, at the end ELK aligned. */
const BASELINE = 11;

export function placedFrom(
  built: BraidGraph,
  laidOut: ElkGraph,
  mode: Mode,
): Placed {
  const moments = new Map<string, Point>();
  const roots = new Map<string, Point>();
  const labels = new Map<string, PlacedLabel>();

  for (const node of laidOut.children) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const centre = { x: x + node.width / 2, y: y + node.height / 2 };
    const slug = rootSlug(node.id);
    if (slug !== null) {
      roots.set(slug, centre);
      continue;
    }
    moments.set(node.id, centre);

    // ELK places the label box relative to the node's corner. River hangs
    // the text off the box's right edge, Subway off its middle.
    const label = node.labels?.[0];
    if (label?.x !== undefined && label.y !== undefined) {
      labels.set(
        node.id,
        mode === "river"
          ? {
            x: x + label.x + label.width,
            y: y + label.y + BASELINE,
            anchor: "end",
            text: label.text,
          }
          : {
            x: x + label.x + label.width / 2,
            y: y + label.y + BASELINE,
            anchor: "middle",
            text: label.text,
          },
      );
    }
  }

  // An edge ELK routed nowhere is left out rather than drawn from nothing.
  const edges = laidOut.edges.flatMap((edge): PlacedEdge[] => {
    const meta = built.meta.get(edge.id);
    const section = edge.sections?.[0];
    if (meta === undefined || section === undefined) return [];
    const points = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ].map((p) => ({ x: p.x, y: p.y }));
    return [{ meta, points }];
  });

  return {
    mode,
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
    moments,
    roots,
    labels,
    edges,
  };
}

/**
 * Hold the trunk to one column.
 *
 * ELK's straightness priority keeps it to within a few pixels of a column;
 * this takes the last few. Every trunk dot moves to the median of where ELK
 * put them, and the end of each edge attached to a moved dot moves with it,
 * so a line still meets its dot. The move is spread along the edge, bends
 * included, rather than dumped into its last few pixels. Edges keep their
 * routing clearance less a few pixels, which is why this is a snap and not a
 * layout.
 */
export function snapTrunk(
  laidOut: ElkGraph,
  trunkIds: ReadonlySet<string>,
  axis: "x" | "y",
): ElkGraph {
  const trunk = laidOut.children.filter((n) => trunkIds.has(n.id));
  if (trunk.length < 2) return laidOut;

  const centre = (n: ElkNode) =>
    (n[axis] ?? 0) + (axis === "x" ? n.width : n.height) / 2;
  const sorted = trunk.map(centre).sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
  const delta = new Map(trunk.map((n) => [n.id, median - centre(n)]));

  const moved = (n: ElkNode, d: number): ElkNode =>
    axis === "x" ? { ...n, x: (n.x ?? 0) + d } : { ...n, y: (n.y ?? 0) + d };
  const shifted = (p: ElkPoint, d: number): ElkPoint =>
    axis === "x" ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d };

  return {
    ...laidOut,
    children: laidOut.children.map((n) => {
      const d = delta.get(n.id);
      return d === undefined ? n : moved(n, d);
    }),
    edges: laidOut.edges.map((e) => {
      const atStart = delta.get(e.sources[0]);
      const atEnd = delta.get(e.targets[0]);
      const section = e.sections?.[0];
      if (section === undefined) return e;
      if (atStart === undefined && atEnd === undefined) return e;

      // A trunk edge joins two trunk dots. ELK attaches an edge up to a few
      // pixels off a node's centre when several leave it, and routes a trunk
      // edge's bends near but not on the column, so a thick line between two
      // aligned dots can still slant. Every point of it goes on the column.
      if (atStart !== undefined && atEnd !== undefined) {
        const onColumn = (p: ElkPoint): ElkPoint =>
          axis === "x" ? { x: median, y: p.y } : { x: p.x, y: median };
        return {
          ...e,
          sections: [{
            ...section,
            startPoint: onColumn(section.startPoint),
            bendPoints: (section.bendPoints ?? []).map(onColumn),
            endPoint: onColumn(section.endPoint),
          }, ...e.sections!.slice(1)],
        };
      }

      // One end moved. A bend between the ends moves by the share of the way
      // it sits from the unmoved end to the moved one, along the time axis,
      // so the move is spread along the line. Leaving bends put a whole snap
      // into the last few pixels before a dot, which drew as a sharp cut.
      const along = axis === "x" ? "y" : "x";
      const from = section.startPoint[along];
      const to = section.endPoint[along];
      const share = (p: ElkPoint) => {
        if (to === from) return 1;
        const f = (p[along] - from) / (to - from);
        return Math.min(1, Math.max(0, f));
      };
      const moveAt = (p: ElkPoint) =>
        atEnd !== undefined ? atEnd * share(p) : atStart! * (1 - share(p));
      return {
        ...e,
        sections: [{
          ...section,
          startPoint: atStart === undefined
            ? section.startPoint
            : shifted(section.startPoint, atStart),
          bendPoints: (section.bendPoints ?? []).map((p) =>
            shifted(p, moveAt(p))
          ),
          endPoint: atEnd === undefined
            ? section.endPoint
            : shifted(section.endPoint, atEnd),
        }, ...e.sections!.slice(1)],
      };
    }),
  };
}

/**
 * Widen the canvas to its box and centre the drawing in it.
 *
 * ELK sizes the canvas to the drawing, which in River is a good deal
 * narrower than the box it sits in. Left alone the picture hugs the left
 * edge, and the year lines, drawn from 0 to the canvas width, stop where the
 * drawing stops rather than crossing the box.
 *
 * Widening rather than stretching the SVG: the drawing is in the canvas's
 * own units, so stretching it to fit would scale the dots, the faces and the
 * text up with it.
 */
export function centreIn(placed: Placed, available: number): Placed {
  // clientWidth is 0 until the element has been laid out; a canvas already
  // wider than its box is the Subway case and wants nothing done to it.
  if (available <= placed.width) return placed;

  const by = (available - placed.width) / 2;
  const move = (p: Point): Point => ({ x: p.x + by, y: p.y });
  const moved = <T>(from: ReadonlyMap<string, T>, at: (v: T) => T) =>
    new Map([...from].map(([key, value]) => [key, at(value)]));

  return {
    ...placed,
    width: available,
    moments: moved(placed.moments, move),
    roots: moved(placed.roots, move),
    labels: moved(placed.labels, (l) => ({ ...l, x: l.x + by })),
    edges: placed.edges.map((edge) => ({
      ...edge,
      points: edge.points.map(move),
    })),
  };
}

export async function placeBraid(
  braid: Braid,
  mode: Mode,
  layout: Layout,
  /** The box the picture has to fill, from the container's clientWidth. */
  available = 0,
): Promise<Placed> {
  const built = graphFor(braid, mode);
  const trunkIds = new Set(
    braid.moments.filter((m) => m.moment.trunk).map((m) => m.moment.id),
  );
  const laidOut = snapTrunk(
    await layout(built.graph),
    trunkIds,
    mode === "river" ? "x" : "y",
  );
  return centreIn(placedFrom(built, laidOut, mode), available);
}
