import { graphFor, rootSlug } from "./graph.ts";
import type { BraidGraph, EdgeMeta, ElkGraph, Mode } from "./graph.ts";
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
          }
          : {
            x: x + label.x + label.width / 2,
            y: y + label.y + BASELINE,
            anchor: "middle",
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

export async function placeBraid(
  braid: Braid,
  mode: Mode,
  layout: Layout,
): Promise<Placed> {
  const built = graphFor(braid, mode);
  return placedFrom(built, await layout(built.graph), mode);
}
