import { hueFor } from "./palette.ts";
import type { Braid } from "./types.ts";

/**
 * The braid as a graph for the Eclipse Layout Kernel.
 *
 * ELK decides where things go; this decides what there is and what it is
 * allowed to do. Every moment is a node pinned to its own layer by date, so
 * the time axis is ours and not the layering's. The trunk is a chain of edges
 * asked to stay straight. Each person's thread is one edge per hop, starting
 * from a root a layer ahead of their first moment, where their face goes.
 *
 * What ELK buys over the lane allocator this replaced: a line can not pass
 * through a node it does not belong to, by construction, where the allocator
 * needed a rule for each way that could happen.
 */

export type Mode = "river" | "subway";

export interface ElkPoint {
  readonly x: number;
  readonly y: number;
}

export interface ElkLabel {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

export interface ElkNode {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly layoutOptions?: Readonly<Record<string, string>>;
  readonly labels?: readonly ElkLabel[];
  readonly x?: number;
  readonly y?: number;
}

export interface ElkSection {
  readonly startPoint: ElkPoint;
  readonly bendPoints?: readonly ElkPoint[];
  readonly endPoint: ElkPoint;
}

export interface ElkEdge {
  readonly id: string;
  readonly sources: readonly string[];
  readonly targets: readonly string[];
  readonly layoutOptions?: Readonly<Record<string, string>>;
  readonly sections?: readonly ElkSection[];
}

export interface ElkGraph {
  readonly id: string;
  readonly layoutOptions: Readonly<Record<string, string>>;
  readonly children: readonly ElkNode[];
  readonly edges: readonly ElkEdge[];
  readonly width?: number;
  readonly height?: number;
}

/** What an edge is, for drawing. ELK carries the id; this carries the rest. */
export type EdgeMeta =
  | { readonly kind: "trunk"; readonly width: number }
  | {
    readonly kind: "thread";
    readonly slug: string;
    readonly hue: number;
    readonly member: boolean;
    readonly segment: "approach" | "excursion";
  };

export interface BraidGraph {
  readonly graph: ElkGraph;
  readonly meta: ReadonlyMap<string, EdgeMeta>;
}

export const TRUNK_R = 7;
export const SIDE_R = 4.5;
export const AVATAR = 18;
/** What a label may claim beside its node; longer titles are cut to it. */
export const LABEL_MAX = 150;
export const LABEL_HEIGHT = 14;
/** Pixels per character at the label's 11px, near enough to reserve room. */
const CHAR = 6.4;

/**
 * A title as its label shows it: whole when it fits the room a label may
 * claim, cut and ended with an ellipsis when it does not. The card and the
 * screen reader's name for the dot carry the whole title either way.
 */
function shown(title: string): string {
  const fits = Math.floor(LABEL_MAX / CHAR);
  return title.length <= fits
    ? title
    : `${title.slice(0, fits - 1).trimEnd()}…`;
}

const ROOT = "root:";
/** The node a person's face sits on, a layer ahead of their first moment. */
export const rootId = (slug: string): string => `${ROOT}${slug}`;
/** The person a root node belongs to, or null for a moment's node. */
export const rootSlug = (id: string): string | null =>
  id.startsWith(ROOT) ? id.slice(ROOT.length) : null;

/** Trunk thickness: a base plus a step per person present. */
export function trunkWidth(joined: number, away: number): number {
  return Math.round((3 + Math.max(1, joined - away) * 1.6) * 10) / 10;
}

export function graphFor(braid: Braid, mode: Mode): BraidGraph {
  const indexOf = new Map(braid.moments.map((m, i) => [m.moment.id, i]));
  const children: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  const meta = new Map<string, EdgeMeta>();

  // River hangs a label beside its node, Subway above it. Telling ELK is what
  // makes it leave room: labels become part of the node's margin, so nothing
  // else is placed there and edges route around them.
  const placement = mode === "river"
    ? "[H_LEFT, V_CENTER, OUTSIDE]"
    : "[H_CENTER, V_TOP, OUTSIDE]";

  for (const placed of braid.moments) {
    const m = placed.moment;
    const r = m.trunk ? TRUNK_R : SIDE_R;
    // The text ELK makes room for is the text that is drawn, which is why
    // the label carries it out of here rather than the renderer reading the
    // title again.
    const text = shown(m.title);
    children.push({
      id: m.id,
      width: r * 2 + 4,
      height: r * 2 + 4,
      layoutOptions: {
        // +1 leaves partition 0 for the earliest root
        "elk.partitioning.partition": String(indexOf.get(m.id)! + 1),
        "elk.nodeLabels.placement": placement,
      },
      labels: [{
        text,
        width: Math.round(text.length * CHAR * 10) / 10,
        height: LABEL_HEIGHT,
      }],
    });
  }

  braid.trunk.forEach((segment, i) => {
    const id = `trunk:${i}`;
    const width = trunkWidth(segment.joined, segment.away);
    edges.push({
      id,
      sources: [segment.from.moment.id],
      targets: [segment.to.moment.id],
      layoutOptions: {
        // High enough to outweigh a layer crowded with detours. At 10 the
        // spine held its column on today's data and wandered a hundred
        // pixels off it on a simulated year or two of growth; at 1000 it
        // stayed within a dozen.
        "elk.layered.priority.straightness": "1000",
        // ELK routes a line as if it had no width. This one is drawn many
        // pixels wide and gets wider with every person who joins, so the
        // room it needs is said here rather than guessed in the spacing.
        "elk.edge.thickness": String(width),
      },
    });
    meta.set(id, { kind: "trunk", width });
  });

  braid.threads.forEach((thread, index) => {
    const slug = thread.person.slug;
    const first = thread.segments[0].points[0];
    children.push({
      id: rootId(slug),
      width: AVATAR * 2,
      height: AVATAR * 2,
      layoutOptions: {
        "elk.partitioning.partition": String(indexOf.get(first.moment.id)!),
      },
    });

    let n = 0;
    const hop = (
      from: string,
      to: string,
      segment: "approach" | "excursion",
    ) => {
      const id = `${slug}:${n}`;
      n += 1;
      edges.push({ id, sources: [from], targets: [to] });
      meta.set(id, {
        kind: "thread",
        slug,
        hue: hueFor(index),
        member: thread.person.member,
        segment,
      });
    };

    for (const segment of thread.segments) {
      if (segment.kind === "excursion") {
        // Whoever is on a detour is already in the group, so the trip leaves
        // the spine, calls at each of its moments in turn, and returns.
        // Every moment of one trip lies between the same two meetups, so the
        // first one's says where it leaves from and comes back to.
        const excursion = braid.excursions.find(
          (e) => e.moment.moment.id === segment.points[0].moment.id,
        );
        if (excursion === undefined) continue;
        let previous = excursion.from.moment.id;
        for (const point of segment.points) {
          hop(previous, point.moment.id, "excursion");
          previous = point.moment.id;
        }
        if (excursion.to !== null) {
          hop(previous, excursion.to.moment.id, "excursion");
        }
        continue;
      }

      let previous = rootId(slug);
      for (const point of segment.points) {
        hop(previous, point.moment.id, "approach");
        previous = point.moment.id;
      }
      // Someone recruited at a detour is named in no trunk moment, so their
      // approach has to be carried on to the meetup they joined at.
      const joined = thread.joinsTrunkAt;
      if (joined !== null && previous !== joined) {
        hop(previous, joined, "approach");
      }
    }
  });

  return {
    graph: {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": mode === "river" ? "DOWN" : "RIGHT",
        "elk.partitioning.activate": "true",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.edgeRouting": "POLYLINE",
        "elk.layered.spacing.nodeNodeBetweenLayers": mode === "river"
          ? "30"
          : "60",
        "elk.spacing.nodeNode": "28",
        // More than the dozen pixels the trunk snap can move the spine by
        // after ELK is done, so the snap has room. At 14 the snapped spine
        // slid under detours' labels as the picture grew.
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "10",
        "elk.spacing.labelNode": "12",
        "elk.padding": "[top=40,left=40,bottom=40,right=40]",
        "elk.layered.thoroughness": "20",
      },
      children,
      edges,
    },
    meta,
  };
}
