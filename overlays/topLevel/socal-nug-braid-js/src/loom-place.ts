import { rootSlug } from "./elk.ts";
import type { ElkGraph, ElkPoint, Mode } from "./elk.ts";
import { loomGraphFor, slotOffset, THICK } from "./loom-graph.ts";
import type { LoomGraph, ThreadMeta } from "./loom-graph.ts";
import type { Story } from "./story.ts";

/**
 * What ELK decided, in the shape the loom is drawn from.
 *
 * ELK hands back boxes and edge sections in its own coordinates. This turns
 * them into each moment's box and centre, the slot each person has across it,
 * anchor points for labels, and a polyline per edge with whose thread it is.
 * The layout itself is injected, as it is for the other engine.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacedLabel {
  readonly x: number;
  readonly y: number;
  readonly anchor: "end" | "middle";
  /** What the layout made room for, which is not always the whole title. */
  readonly text: string;
}

export interface LoomPlaced {
  readonly mode: Mode;
  readonly width: number;
  readonly height: number;
  /** Centre of each moment's box. */
  readonly moments: ReadonlyMap<string, Point>;
  readonly boxes: ReadonlyMap<string, Box>;
  /** Where each person's bead would go: keyed by slotKey(). */
  readonly slots: ReadonlyMap<string, Point>;
  readonly roots: ReadonlyMap<string, Point>;
  readonly labels: ReadonlyMap<string, PlacedLabel>;
  readonly edges: readonly {
    readonly meta: ThreadMeta;
    readonly points: readonly Point[];
  }[];
}

export type Layout = (graph: ElkGraph) => Promise<ElkGraph>;

/** Where a label's text hangs from: its baseline, at the end ELK aligned. */
const BASELINE = 11;

export function slotKey(moment: string, slug: string): string {
  return `${moment}|${slug}`;
}

export function loomPlacedFrom(
  built: LoomGraph,
  laidOut: ElkGraph,
  story: Story,
  mode: Mode,
): LoomPlaced {
  const river = mode === "river";
  const gatherings = new Map(story.moments.map((g) => [g.moment.id, g]));
  const moments = new Map<string, Point>();
  const boxes = new Map<string, Box>();
  const slots = new Map<string, Point>();
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
    boxes.set(node.id, { x, y, width: node.width, height: node.height });

    const gathering = gatherings.get(node.id)!;
    for (const p of gathering.through) {
      const offset = slotOffset(gathering.slots, p.slot);
      slots.set(
        slotKey(node.id, p.slug),
        river
          ? { x: x + offset, y: y + THICK / 2 }
          : { x: x + THICK / 2, y: y + offset },
      );
    }

    // ELK places the label box relative to the node's corner. River hangs
    // the text off the box's right edge, Subway off its middle.
    const label = node.labels?.[0];
    if (label?.x !== undefined && label.y !== undefined) {
      labels.set(
        node.id,
        river
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

  // ELK runs an edge from a port on one box's edge to a port on the next, so
  // a thread drawn from that alone stops at every oval. Each end on a port is
  // carried on to the person's slot inside the oval; an end on a face is
  // already where it belongs. A port id is `${moment}|${side}|${slug}`.
  const slotAt = (end: string): Point[] => {
    const [moment, , slug] = end.split("|");
    return slug === undefined ? [] : [slots.get(slotKey(moment, slug))!];
  };

  // An edge ELK routed nowhere is left out rather than drawn from nothing.
  const edges = laidOut.edges.flatMap((edge) => {
    const meta = built.meta.get(edge.id);
    const section = edge.sections?.[0];
    if (meta === undefined || section === undefined) return [];
    const points = [
      ...slotAt(edge.sources[0]),
      ...[
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ].map((p) => ({ x: p.x, y: p.y })),
      ...slotAt(edge.targets[0]),
    ];
    return [{ meta, points }];
  });

  return {
    mode,
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
    moments,
    boxes,
    slots,
    roots,
    labels,
    edges,
  };
}

/**
 * Hold the ribbon to one column.
 *
 * ELK is given a spine to keep straight, and that is what holds the ribbon.
 * This takes whatever it leaves. Every moment on the ribbon moves across the
 * time axis until its first slot, with someone in it or not, is on the median
 * of where ELK put them all. Its ports and its label are placed from its
 * corner and go with it. An edge moves at each end by as much as the moment
 * that end is on, and each bend by its share of the two, by how far along the
 * time axis it sits between them, so a move is spread along the line and not
 * dumped into its last few pixels.
 *
 * Nothing is routed again, so a move eats into the room ELK left between a
 * thread and what it passes. This is for a last few pixels and cannot stand
 * in for the spine: tried without it, the moves ran to hundreds of pixels and
 * put threads through ovals that were not theirs. The smoke check fails when
 * a thread runs through anything that is not its own.
 */
export function snapRibbon(laidOut: ElkGraph, story: Story, mode: Mode): ElkGraph {
  const axis = mode === "river" ? "x" : "y";
  const along = mode === "river" ? "y" : "x";
  const firstSlot = new Map(
    story.moments
      .filter((g) => g.onRibbon)
      .map((g) => [g.moment.id, slotOffset(g.slots, 0)]),
  );
  const ribbon = laidOut.children.filter((n) => firstSlot.has(n.id));
  if (ribbon.length === 0) return laidOut;

  const at = ribbon
    .map((n) => (n[axis] ?? 0) + firstSlot.get(n.id)!)
    .sort((a, b) => a - b);
  const mid = at.length >> 1;
  const column = at.length % 2 === 1 ? at[mid] : (at[mid - 1] + at[mid]) / 2;
  const move = new Map(
    ribbon.map((n) => [n.id, column - firstSlot.get(n.id)! - (n[axis] ?? 0)]),
  );

  // An end is on a moment's port, whose id starts with the moment's, or on a
  // face, which stays where it is.
  const moveAt = (end: string) => move.get(end.split("|")[0]) ?? 0;
  const shifted = (p: ElkPoint, by: number): ElkPoint =>
    axis === "x" ? { x: p.x + by, y: p.y } : { x: p.x, y: p.y + by };

  return {
    ...laidOut,
    children: laidOut.children.map((n) => {
      const by = move.get(n.id);
      return by === undefined ? n : { ...n, [axis]: (n[axis] ?? 0) + by };
    }),
    edges: laidOut.edges.map((e) => {
      if (e.sections === undefined) return e;
      const atStart = moveAt(e.sources[0]);
      const atEnd = moveAt(e.targets[0]);
      return {
        ...e,
        sections: e.sections.map((section) => {
          const from = section.startPoint[along];
          const to = section.endPoint[along];
          const share = (p: ElkPoint) =>
            to === from ? 1 : Math.min(1, Math.max(0, (p[along] - from) / (to - from)));
          return {
            ...section,
            startPoint: shifted(section.startPoint, atStart),
            bendPoints: (section.bendPoints ?? []).map((p) =>
              shifted(p, atStart + (atEnd - atStart) * share(p))
            ),
            endPoint: shifted(section.endPoint, atEnd),
          };
        }),
      };
    }),
  };
}

/**
 * Widen the canvas to its box and centre the drawing in it.
 *
 * Widening rather than stretching the SVG: the drawing is in the canvas's
 * own units, so stretching it to fit would scale the ovals, the faces and the
 * text up with it.
 */
export function centreLoomIn(
  placed: LoomPlaced,
  available: number,
): LoomPlaced {
  // clientWidth is 0 until the element has been laid out; a canvas already
  // wider than its box wants nothing done to it.
  if (available <= placed.width) return placed;

  const by = (available - placed.width) / 2;
  const move = (p: Point): Point => ({ x: p.x + by, y: p.y });
  const moved = <T>(from: ReadonlyMap<string, T>, at: (v: T) => T) =>
    new Map([...from].map(([key, value]) => [key, at(value)]));

  return {
    ...placed,
    width: available,
    moments: moved(placed.moments, move),
    boxes: moved(placed.boxes, (b) => ({ ...b, x: b.x + by })),
    slots: moved(placed.slots, move),
    roots: moved(placed.roots, move),
    labels: moved(placed.labels, (l) => ({ ...l, x: l.x + by })),
    edges: placed.edges.map((edge) => ({
      ...edge,
      points: edge.points.map(move),
    })),
  };
}

export async function placeLoom(
  story: Story,
  mode: Mode,
  layout: Layout,
  /** The box the picture has to fill, from the container's clientWidth. */
  available = 0,
): Promise<LoomPlaced> {
  const built = loomGraphFor(story, mode);
  const laidOut = snapRibbon(await layout(built.graph), story, mode);
  return centreLoomIn(loomPlacedFrom(built, laidOut, story, mode), available);
}
