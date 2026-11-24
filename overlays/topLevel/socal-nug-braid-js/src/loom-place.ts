import { rootSlug } from "./elk.ts";
import type { ElkGraph, Mode } from "./elk.ts";
import { loomGraphFor, passId, slotOffset, THICK } from "./loom-graph.ts";
import type { LoomGraph, ThreadMeta } from "./loom-graph.ts";
import type { Story } from "./story.ts";

/**
 * What ELK decided, in the shape the loom is drawn from.
 *
 * ELK hands back boxes and edge sections in its own coordinates. This turns
 * them into each moment's box and centre, the slot each person has across it,
 * anchor points for labels, each pass-through's box, and a polyline per edge
 * with whose thread it is and which nodes it runs between.
 * The layout itself is injected, so tests can fake it.
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
  /** Each pass-through's box, keyed by the side moment it passes. Never drawn. */
  readonly passes: ReadonlyMap<string, Box>;
  /**
   * Where each person's bead would go: keyed by slotKey(). Also where each
   * person passing a side moment runs through its pass-through, keyed by
   * slotKey(passId(moment), slug).
   */
  readonly slots: ReadonlyMap<string, Point>;
  readonly roots: ReadonlyMap<string, Point>;
  readonly labels: ReadonlyMap<string, PlacedLabel>;
  readonly edges: readonly {
    readonly meta: ThreadMeta;
    /** The node the edge leaves: a face's rootId, a moment's id or a passId. */
    readonly from: string;
    /** The node the edge arrives at, named the same way. */
    readonly to: string;
    readonly points: readonly Point[];
  }[];
}

export type Layout = (graph: ElkGraph) => Promise<ElkGraph>;

/** Where a label's text hangs from: its baseline, at the end ELK aligned. */
const BASELINE = 11;

/**
 * How far short of a meetup's box a thread stops, and how far after it the
 * thread starts again, when its person is away from it. Half the thread's
 * width of that is its round cap.
 */
export const AWAY_GAP = 3.5;

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
  const passed = new Map(story.moments.map((g) => [passId(g.moment.id), g]));
  const moments = new Map<string, Point>();
  const boxes = new Map<string, Box>();
  const passes = new Map<string, Box>();
  const slots = new Map<string, Point>();
  const roots = new Map<string, Point>();
  const labels = new Map<string, PlacedLabel>();

  const slotAcross = (x: number, y: number, offset: number): Point =>
    river ? { x: x + offset, y: y + THICK / 2 } : { x: x + THICK / 2, y: y + offset };

  for (const node of laidOut.children) {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const centre = { x: x + node.width / 2, y: y + node.height / 2 };
    const slug = rootSlug(node.id);
    if (slug !== null) {
      roots.set(slug, centre);
      continue;
    }
    // A pass-through is not a moment. It keeps its box, and a place for each
    // person passing, so their two edges join inside it.
    const passing = passed.get(node.id);
    if (passing !== undefined) {
      passes.set(passing.moment.id, { x, y, width: node.width, height: node.height });
      for (const p of passing.passing) {
        slots.set(
          slotKey(node.id, p.slug),
          slotAcross(x, y, slotOffset(passing.inGroup, p.slot)),
        );
      }
      continue;
    }
    moments.set(node.id, centre);
    boxes.set(node.id, { x, y, width: node.width, height: node.height });

    const gathering = gatherings.get(node.id)!;
    for (const p of gathering.through) {
      slots.set(
        slotKey(node.id, p.slug),
        slotAcross(x, y, slotOffset(gathering.slots, p.slot)),
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
  // carried on to the person's slot inside the oval or pass-through; an end on
  // a face is already where it belongs. A port id is `${node}|${side}|${slug}`.
  const slotAt = (end: string): Point[] => {
    const [node, , slug] = end.split("|");
    return slug === undefined ? [] : [slots.get(slotKey(node, slug))!];
  };
  // The node an edge end is on: a port's node, or a face's own id.
  const nodeOf = (end: string): string => end.split("|")[0];
  // An end at a meetup its person is away from is not carried on to the slot.
  // It is pulled back off the box instead, AWAY_GAP along time, at the slot
  // across it, so the thread breaks either side of the meetup.
  const awayAt = (end: string): boolean => {
    const [node, , slug] = end.split("|");
    return gatherings.get(node)?.through.find((p) => p.slug === slug)?.away ?? false;
  };
  const shortOf = (end: string): Point => {
    const [node, side, slug] = end.split("|");
    const box = boxes.get(node)!;
    const slot = slots.get(slotKey(node, slug))!;
    const into = side === "in";
    return river
      ? { x: slot.x, y: into ? box.y - AWAY_GAP : box.y + box.height + AWAY_GAP }
      : { x: into ? box.x - AWAY_GAP : box.x + box.width + AWAY_GAP, y: slot.y };
  };

  // An edge ELK routed nowhere is left out rather than drawn from nothing.
  const edges = laidOut.edges.flatMap((edge) => {
    const meta = built.meta.get(edge.id);
    const section = edge.sections?.[0];
    if (meta === undefined || section === undefined) return [];
    const source = edge.sources[0];
    const target = edge.targets[0];
    const route = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ].map((p) => ({ x: p.x, y: p.y }));
    const points = [
      ...(awayAt(source) ? [shortOf(source)] : [...slotAt(source), route[0]]),
      ...route.slice(1, -1),
      ...(awayAt(target) ? [shortOf(target)] : [route.at(-1)!, ...slotAt(target)]),
    ];
    return [{
      meta,
      from: nodeOf(source),
      to: nodeOf(target),
      points,
    }];
  });

  return {
    mode,
    width: laidOut.width ?? 0,
    height: laidOut.height ?? 0,
    moments,
    boxes,
    passes,
    slots,
    roots,
    labels,
    edges,
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
    passes: moved(placed.passes, (b) => ({ ...b, x: b.x + by })),
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
  const laidOut = await layout(built.graph);
  return centreLoomIn(loomPlacedFrom(built, laidOut, story, mode), available);
}
