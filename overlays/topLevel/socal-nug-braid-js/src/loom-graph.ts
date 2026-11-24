import { AVATAR, labelWidth, LABEL_HEIGHT, rootId, shown } from "./elk.ts";
import type { ElkEdge, ElkGraph, ElkNode, ElkPort, Mode } from "./elk.ts";
import { hueFor } from "./palette.ts";
import type { Story } from "./story.ts";

/**
 * The story as a graph for the Eclipse Layout Kernel.
 *
 * Every moment is a node as wide as the people through it, pinned to its own
 * layer by date. Each person through it, someone the record lists away from a
 * meetup included, has a port on the side time comes from and another on the
 * side it leaves by, at their slot, so ELK keeps their threads apart instead
 * of attaching every edge at about the same point.
 *
 * A side moment that someone passes has an unseen pass-through beside it in
 * its layer, with ports for the members of the group who are not at it and
 * whose thread goes on to a later moment. A person's thread is one edge from
 * their root to their first stop and one from each stop to the next, where a
 * stop is a moment they are through or a pass-through they run straight
 * through.
 *
 * One more edge chain is nobody's thread: the spine, from each moment on the
 * ribbon or pass-through to the next, which ELK is told to keep straight. It
 * is what holds the ribbon to one column, and it is never placed or drawn.
 */

/** Between one thread and the next across a moment. */
export const SLOT = 7;
/** From a moment's edge to its first and last slot. */
export const PAD = 8;
/** A moment's size along the time axis. */
export const THICK = 14;

/** A moment's size across the time axis. */
export function across(slots: number): number {
  return Math.max(18, (slots - 1) * SLOT + 2 * PAD);
}

/** Where a slot sits across a moment, from its leading edge. Centred when there is one. */
export function slotOffset(slots: number, slot: number): number {
  return slots === 1 ? across(1) / 2 : PAD + slot * SLOT;
}

export function portId(moment: string, side: "in" | "out", slug: string): string {
  return `${moment}|${side}|${slug}`;
}

/** The unseen node the ribbon passes a side moment by, in that moment's layer. */
export function passId(moment: string): string {
  return `pass:${moment}`;
}

/** Stands where a slug would in the ids of the spine's ports. It is nobody's slug. */
const SPINE = "~";

export interface ThreadMeta {
  readonly slug: string;
  readonly hue: number;
  readonly member: boolean;
}

export interface LoomGraph {
  readonly graph: ElkGraph;
  readonly meta: ReadonlyMap<string, ThreadMeta>;
}

export function loomGraphFor(story: Story, mode: Mode): LoomGraph {
  const river = mode === "river";
  const indexOf = new Map(story.moments.map((g, i) => [g.moment.id, i]));
  const children: ElkNode[] = [];
  const edges: ElkEdge[] = [];
  const meta = new Map<string, ThreadMeta>();

  // River hangs a label beside its node, Subway above it. Telling ELK is what
  // makes it leave room: labels become part of the node's margin, so nothing
  // else is placed there and edges route around them.
  const placement = river
    ? "[H_LEFT, V_CENTER, OUTSIDE]"
    : "[H_CENTER, V_TOP, OUTSIDE]";

  const port = (id: string, along: number, offset: number, side: string): ElkPort => ({
    id,
    // No size: ELK attaches an edge to a sized port off its corner, which put
    // every thread a pixel across from its slot.
    width: 0,
    height: 0,
    x: river ? offset : along,
    y: river ? along : offset,
    layoutOptions: { "elk.port.side": side },
  });

  const pair = (node: string, who: string, offset: number) => [
    port(portId(node, "in", who), 0, offset, river ? "NORTH" : "WEST"),
    port(portId(node, "out", who), THICK, offset, river ? "SOUTH" : "EAST"),
  ];

  for (const gathering of story.moments) {
    const m = gathering.moment;
    const size = across(gathering.slots);
    const text = shown(m.title);
    const ports = gathering.through.flatMap((p) =>
      pair(m.id, p.slug, slotOffset(gathering.slots, p.slot))
    );
    if (gathering.onRibbon) {
      ports.push(...pair(m.id, SPINE, slotOffset(gathering.slots, 0) - SLOT / 2));
    }
    // +1 leaves partition 0 for the earliest root
    const layer = String(indexOf.get(m.id)! + 1);
    children.push({
      id: m.id,
      width: river ? size : THICK,
      height: river ? THICK : size,
      layoutOptions: {
        "elk.partitioning.partition": layer,
        "elk.nodeLabels.placement": placement,
        "elk.portConstraints": "FIXED_POS",
      },
      labels: [{ text, width: labelWidth(text), height: LABEL_HEIGHT }],
      ports,
    });

    // A side moment that someone passes: the ribbon passes it by through a
    // node of its own in the same layer, as wide as the group, which the
    // members who are not at the moment and whose thread goes on to a later
    // moment run straight through at their ribbon slots. Without it ELK
    // orders the side moment inside the ribbon, next to its people's
    // threads, and every thread beyond it steps out around it.
    if (gathering.passing.length > 0) {
      const id = passId(m.id);
      const width = across(gathering.inGroup);
      children.push({
        id,
        width: river ? width : THICK,
        height: river ? THICK : width,
        layoutOptions: {
          "elk.partitioning.partition": layer,
          "elk.portConstraints": "FIXED_POS",
        },
        ports: [
          ...gathering.passing.flatMap((p) =>
            pair(id, p.slug, slotOffset(gathering.inGroup, p.slot))
          ),
          ...pair(id, SPINE, slotOffset(gathering.inGroup, 0) - SLOT / 2),
        ],
      });
    }
  }

  story.threads.forEach((thread, index) => {
    const slug = thread.person.slug;
    const info: ThreadMeta = {
      slug,
      hue: hueFor(index),
      member: thread.person.member,
    };
    children.push({
      id: rootId(slug),
      width: AVATAR * 2,
      height: AVATAR * 2,
      layoutOptions: {
        "elk.partitioning.partition": String(indexOf.get(thread.path[0].moment.id)!),
      },
    });

    // Each stop is a moment they are through, a meetup they are away from
    // included, or a pass-through they run straight through, in date order.
    const stops = story.moments.flatMap((g) =>
      g.through.some((p) => p.slug === slug)
        ? [g.moment.id]
        : g.passing.some((p) => p.slug === slug)
        ? [passId(g.moment.id)]
        : []
    );
    let source = rootId(slug);
    stops.forEach((stop, n) => {
      const id = `${slug}:${n}`;
      edges.push({ id, sources: [source], targets: [portId(stop, "in", slug)] });
      meta.set(id, info);
      source = portId(stop, "out", slug);
    });
  });

  // The spine: an edge from each moment on the ribbon or pass-through to the
  // next, half a slot before the first slot, that ELK is told to keep
  // straight above all else. A straight spine is a first slot in the same
  // place at both its ends, so this is what holds the ribbon to one column.
  // The threads cannot do it: where the group splits up between two meetups
  // no thread runs from the one to the other, and giving the threads a
  // priority as well as the spine takes the spine's away and lets the ribbon
  // jog again. It has no meta, so nothing places or draws it.
  const ribbon = story.moments.flatMap((g) =>
    g.onRibbon
      ? [g.moment.id]
      : g.passing.length > 0
      ? [passId(g.moment.id)]
      : []
  );
  ribbon.slice(1).forEach((id, n) => {
    edges.push({
      id: `spine:${n}`,
      sources: [portId(ribbon[n], "out", SPINE)],
      targets: [portId(id, "in", SPINE)],
      layoutOptions: { "elk.layered.priority.straightness": "1000" },
    });
  });

  return {
    graph: {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": river ? "DOWN" : "RIGHT",
        "elk.partitioning.activate": "true",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.edgeRouting": "POLYLINE",
        "elk.layered.spacing.nodeNodeBetweenLayers": river ? "30" : "60",
        "elk.spacing.nodeNode": "28",
        "elk.spacing.edgeNode": "20",
        "elk.spacing.edgeEdge": "7",
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
